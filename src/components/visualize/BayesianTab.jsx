import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Box,
  Typography,
  Grid,
  Paper,
  Card,
  CardContent,
  Autocomplete,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Alert,
  AlertTitle,
  CircularProgress,
  Pagination,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  ToggleButton,
  ToggleButtonGroup,
  Divider,
} from "@mui/material";
import DatasetPicker, { useDatasetPair } from "./Datasetpicker";

/* ───────────────────────── Statistics helpers ───────────────────────── */

const N_DRAWS = 10000;

// Seeded random numbers: the same data always gives the same result.
const mulberry32 = (seed) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const hashString = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const makeSampler = (rng) => {
  const normal = () => {
    let u = 0;
    while (u === 0) u = rng();
    const v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  // Marsaglia–Tsang gamma sampler
  const gamma = (shape) => {
    if (shape < 1) {
      const u = rng() || 1e-12;
      return gamma(shape + 1) * Math.pow(u, 1 / shape);
    }
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x, v;
      do {
        x = normal();
        v = 1 + c * x;
      } while (v <= 0);
      v = v * v * v;
      const u = rng();
      if (u < 1 - 0.0331 * x * x * x * x) return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  };
  return { normal, gamma };
};

const toNumbers = (rows, column) => {
  const out = [];
  for (const row of rows) {
    const v = row?.[column];
    if (v === null || v === undefined || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
};

const summarize = (values) => {
  const n = values.length;
  if (!n) return { n: 0, mean: 0, variance: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance =
    n > 1 ? values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1) : 0;
  return { n, mean, variance };
};

// Posterior of a group mean with a flat (non-informative) prior:
// sigma² ~ Inverse-Chi², then mean ~ Normal(sample mean, sigma²/n)  (a Student-t overall)
const drawMeans = ({ n, mean, variance }, count, sampler) => {
  const out = new Float64Array(count);
  if (n < 2 || variance <= 0) {
    out.fill(mean);
    return out;
  }
  const df = n - 1;
  for (let i = 0; i < count; i++) {
    const chi2 = 2 * sampler.gamma(df / 2);
    const sigma2 = (df * variance) / chi2;
    out[i] = mean + Math.sqrt(sigma2 / n) * sampler.normal();
  }
  return out;
};

const drawDifference = (statsA, statsB, column) => {
  const sampler = makeSampler(mulberry32(hashString(column)));
  const a = drawMeans(statsA, N_DRAWS, sampler);
  const b = drawMeans(statsB, N_DRAWS, sampler);
  const diff = new Float64Array(N_DRAWS);
  for (let i = 0; i < N_DRAWS; i++) diff[i] = a[i] - b[i];
  return diff;
};

const analyzeColumn = (column, withRows, withoutRows, level, minChangePct) => {
  const a = summarize(toNumbers(withRows, column));
  const b = summarize(toNumbers(withoutRows, column));
  if (a.n < 2 || b.n < 2) return null;

  const diffs = drawDifference(a, b, column);
  const sorted = Float64Array.from(diffs).sort();
  const tail = (1 - level) / 2;
  const ciLower = sorted[Math.floor(N_DRAWS * tail)];
  const ciUpper =
    sorted[Math.min(N_DRAWS - 1, Math.floor(N_DRAWS * (1 - tail)))];

  // "Meaningful" change is measured against the without-product average
  const delta = Math.abs(b.mean) * (minChangePct / 100);
  let pos = 0,
    neg = 0,
    up = 0,
    down = 0;
  for (let i = 0; i < N_DRAWS; i++) {
    const d = diffs[i];
    if (d > 0) pos++;
    if (d < 0) neg++;
    if (d > delta) up++;
    if (d < -delta) down++;
  }

  const meanDiff = a.mean - b.mean;
  const pooledVar =
    ((a.n - 1) * a.variance + (b.n - 1) * b.variance) / (a.n + b.n - 2);
  const pooledSd = Math.sqrt(pooledVar);

  const pUp = up / N_DRAWS;
  const pDown = down / N_DRAWS;
  let verdict = "uncertain";
  if (pUp >= level) verdict = "increase";
  else if (pDown >= level) verdict = "decrease";

  return {
    column,
    statsWith: a,
    statsWithout: b,
    meanDiff,
    pctChange:
      Math.abs(b.mean) > 1e-12 ? (meanDiff / Math.abs(b.mean)) * 100 : null,
    effectSize: pooledSd > 0 ? meanDiff / pooledSd : 0,
    ciLower,
    ciUpper,
    pPositive: pos / N_DRAWS,
    pNegative: neg / N_DRAWS,
    pUp,
    pDown,
    verdict,
  };
};

/* ───────────────────────── Small presentation helpers ───────────────────────── */

const fmt = (v, d = 4) => (Number.isFinite(v) ? v.toFixed(d) : "N/A");
const pct = (p) => `${(p * 100).toFixed(1)}%`;

const VERDICT = {
  increase: { label: "Likely increase", color: "warning" },
  decrease: { label: "Likely decrease", color: "info" },
  uncertain: { label: "No clear change", color: "default" },
};

const ui = {
  page: {
    minHeight: "100%",
    background: "linear-gradient(180deg, #F7F9FC 0%, #FFFFFF 46%)",
    borderRadius: 3,
  },
  surface: {
    border: "1px solid #E5EAF2",
    borderRadius: 3,
    boxShadow: "0 8px 28px rgba(15,23,42,.06)",
    backgroundImage: "none",
  },
  softSurface: {
    border: "1px solid #E8EDF5",
    borderRadius: 2.5,
    backgroundColor: "#FAFBFD",
  },
};

const describeResult = (r, level, minChangePct, labelWith, labelWithout) => {
  const lvl = `${Math.round(level * 100)}%`;
  const range = `${lvl} credible range ${fmt(r.ciLower, 3)} to ${fmt(r.ciUpper, 3)}`;
  const bigger = minChangePct > 0 ? ` by more than ${minChangePct}%` : "";
  if (r.verdict === "increase") {
    return `There is a ${pct(r.pUp)} probability that ${r.column} is higher in ${labelWith} than in ${labelWithout}${bigger}. Most likely difference: ${fmt(r.meanDiff, 3)} (${range}).`;
  }
  if (r.verdict === "decrease") {
    return `There is a ${pct(r.pDown)} probability that ${r.column} is lower in ${labelWith} than in ${labelWithout}${bigger}. Most likely difference: ${fmt(r.meanDiff, 3)} (${range}).`;
  }
  return `No clear change in ${r.column}. The probability it is higher is ${pct(r.pPositive)} and lower is ${pct(r.pNegative)}. Most likely difference: ${fmt(r.meanDiff, 3)} (${range}).`;
};

// Histogram of the posterior difference, drawn with plain SVG (no chart library needed)
const DifferencePlot = ({ draws, ciLower, ciUpper }) => {
  const W = 520,
    H = 230,
    padL = 12,
    padR = 12,
    padT = 12,
    padB = 36,
    bins = 40;
  const sorted = Float64Array.from(draws).sort();
  let lo = sorted[Math.floor(sorted.length * 0.005)];
  let hi = sorted[Math.floor(sorted.length * 0.995)];
  if (hi === lo) {
    lo -= 0.5;
    hi += 0.5;
  }
  const range = hi - lo;
  const counts = new Array(bins).fill(0);
  for (const d of draws) {
    if (d < lo || d > hi) continue;
    counts[Math.min(bins - 1, Math.floor(((d - lo) / range) * bins))]++;
  }
  const maxCount = Math.max(...counts) || 1;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const x = (v) => padL + ((v - lo) / range) * plotW;
  const barW = plotW / bins;
  const ticks = [lo, (lo + hi) / 2, hi];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label="Distribution of the difference between the two averages"
    >
      {counts.map((c, k) => {
        const center = lo + ((k + 0.5) / bins) * range;
        const inside = center >= ciLower && center <= ciUpper;
        const h = (c / maxCount) * plotH;
        return (
          <rect
            key={k}
            x={padL + k * barW + 0.5}
            y={padT + plotH - h}
            width={Math.max(barW - 1, 1)}
            height={h}
            fill={inside ? "#2563EB" : "#BFD3F8"}
          />
        );
      })}
      <line
        x1={padL}
        x2={W - padR}
        y1={padT + plotH}
        y2={padT + plotH}
        stroke="#94A3B8"
      />
      {lo < 0 && hi > 0 && (
        <g>
          <line
            x1={x(0)}
            x2={x(0)}
            y1={padT}
            y2={padT + plotH}
            stroke="#DC2626"
            strokeDasharray="5 4"
          />
          <text
            x={x(0)}
            y={H - 6}
            textAnchor="middle"
            fontSize="11"
            fill="#DC2626"
          >
            0 (no change)
          </text>
        </g>
      )}
      {ticks.map((t, i) => (
        <text
          key={i}
          x={x(t)}
          y={padT + plotH + 16}
          textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}
          fontSize="11"
          fill="#64748B"
        >
          {Number(t.toPrecision(3))}
        </text>
      ))}
    </svg>
  );
};

/* ───────────────────────── Component ───────────────────────── */

const BayesianTab = ({
  availableColumns = [],
  withProductData: defaultWithData, // used only if `datasets` is not passed
  withoutProductData: defaultWithoutData,
  datasets,
}) => {
  // The user picks Dataset A and Dataset B; the difference is A minus B.
  const pair = useDatasetPair(datasets, defaultWithData, defaultWithoutData);
  const withProductData = pair.dataA;
  const withoutProductData = pair.dataB;
  const labelWith = pair.labelA;
  const labelWithout = pair.labelB;

  const [selectedColumn, setSelectedColumn] = useState("");
  const [level, setLevel] = useState(0.95);
  const [minChangeInput, setMinChangeInput] = useState("1");
  const [minChangePct, setMinChangePct] = useState(1);
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const runIdRef = useRef(0);
  const rowsPerPage = 15;

  // Wait a moment after typing before recalculating
  useEffect(() => {
    const timer = setTimeout(() => {
      const v = Number(minChangeInput);
      setMinChangePct(Number.isFinite(v) && v >= 0 ? v : 0);
    }, 400);
    return () => clearTimeout(timer);
  }, [minChangeInput]);

  useEffect(() => {
    if (availableColumns.length > 0 && !selectedColumn)
      setSelectedColumn(availableColumns[0]);
  }, [availableColumns, selectedColumn]);

  useEffect(() => {
    if (
      !availableColumns.length ||
      !withProductData.length ||
      !withoutProductData.length
    ) {
      setResults([]);
      setIsLoading(false);
      return undefined;
    }
    const runId = ++runIdRef.current;
    setIsLoading(true);

    (async () => {
      const out = [];
      for (let i = 0; i < availableColumns.length; i++) {
        const r = analyzeColumn(
          availableColumns[i],
          withProductData,
          withoutProductData,
          level,
          minChangePct,
        );
        if (r) out.push(r);
        if (i % 5 === 4) {
          await new Promise((res) => setTimeout(res, 0)); // keep the page responsive
          if (runId !== runIdRef.current) return;
        }
      }
      if (runId !== runIdRef.current) return;
      out.sort((a, b) => Math.abs(b.effectSize) - Math.abs(a.effectSize));
      setResults(out);
      setPage(1);
      setIsLoading(false);
    })();

    return () => {
      runIdRef.current++;
    };
  }, [
    availableColumns,
    withProductData,
    withoutProductData,
    level,
    minChangePct,
  ]);

  const counts = useMemo(
    () => ({
      increase: results.filter((r) => r.verdict === "increase").length,
      decrease: results.filter((r) => r.verdict === "decrease").length,
      uncertain: results.filter((r) => r.verdict === "uncertain").length,
    }),
    [results],
  );

  const filtered = useMemo(
    () =>
      filter === "all" ? results : results.filter((r) => r.verdict === filter),
    [results, filter],
  );
  const pageRows = filtered.slice((page - 1) * rowsPerPage, page * rowsPerPage);
  const selected = results.find((r) => r.column === selectedColumn);

  const selectedDraws = useMemo(
    () =>
      selected
        ? drawDifference(
            selected.statsWith,
            selected.statsWithout,
            selected.column,
          )
        : null,
    [selected],
  );

  if (!withProductData.length || !withoutProductData.length) {
    return (
      <Box sx={{ p: 3 }}>
        <DatasetPicker datasets={datasets} pair={pair} />
        <Alert severity="info">
          <AlertTitle>No Data Available</AlertTitle>
          Please load both datasets to run the Bayesian comparison.
        </Alert>
      </Box>
    );
  }

  if (isLoading) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 400,
        }}
      >
        <CircularProgress />
        <Typography sx={{ mt: 2, color: "text.secondary" }}>
          Running Bayesian analysis on {availableColumns.length} columns...
        </Typography>
      </Box>
    );
  }

  const summaryCards = [
    [
      "Columns analyzed",
      results.length,
      "Numeric columns with enough data",
      "#2563EB",
    ],
    ["Likely increase", counts.increase, `Higher in ${labelWith}`, "#D97706"],
    ["Likely decrease", counts.decrease, `Lower in ${labelWith}`, "#0284C7"],
    [
      "No clear change",
      counts.uncertain,
      "Not enough evidence either way",
      "#64748B",
    ],
  ];

  return (
    <Box sx={{ ...ui.page, p: { xs: 1.5, sm: 2.5, md: 3 } }}>
      <Paper
        elevation={0}
        sx={{ ...ui.surface, p: { xs: 2, md: 2.75 }, mb: 2.5 }}
      >
        <Typography
          variant="h5"
          sx={{
            fontWeight: 800,
            color: "#0F172A",
            fontSize: { xs: "1.25rem", md: "1.55rem" },
          }}
        >
          Bayesian Analysis
        </Typography>
        <Typography variant="body2" sx={{ color: "#64748B", mt: 0.5 }}>
          For each column, how likely is it that the average changed between{" "}
          {labelWith} and {labelWithout}, and by how much?
        </Typography>
      </Paper>

      <DatasetPicker datasets={datasets} pair={pair} />

      <Grid container spacing={2} sx={{ mb: 2.5 }}>
        {summaryCards.map(([label, value, helper, color]) => (
          <Grid item xs={12} sm={6} md={3} key={label}>
            <Paper
              elevation={0}
              sx={{
                ...ui.surface,
                p: 2.25,
                height: "100%",
                borderLeft: `4px solid ${color}`,
              }}
            >
              <Typography
                variant="body2"
                sx={{ color: "#64748B", fontWeight: 650 }}
              >
                {label}
              </Typography>
              <Typography
                sx={{
                  fontSize: 28,
                  fontWeight: 800,
                  color: "#0F172A",
                  lineHeight: 1.2,
                }}
              >
                {value}
              </Typography>
              <Typography variant="caption" sx={{ color: "#94A3B8" }}>
                {helper}
              </Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Paper elevation={0} sx={{ ...ui.softSurface, p: 2, mb: 2.5 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={5}>
            <Autocomplete
              options={results.map((r) => r.column)}
              value={selected ? selected.column : null}
              onChange={(e, v) => v && setSelectedColumn(v)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Variable to inspect"
                  size="small"
                />
              )}
              sx={{ bgcolor: "white" }}
              disableClearable
              autoHighlight
            />
          </Grid>
          <Grid item xs={6} md={3}>
            <FormControl fullWidth size="small" sx={{ bgcolor: "white" }}>
              <InputLabel>Confidence level</InputLabel>
              <Select
                value={level}
                label="Confidence level"
                onChange={(e) => setLevel(e.target.value)}
              >
                <MenuItem value={0.9}>90%</MenuItem>
                <MenuItem value={0.95}>95%</MenuItem>
                <MenuItem value={0.99}>99%</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6} md={4}>
            <TextField
              fullWidth
              size="small"
              type="number"
              label="Minimum meaningful change (%)"
              value={minChangeInput}
              onChange={(e) => setMinChangeInput(e.target.value)}
              inputProps={{ min: 0, step: 0.5 }}
              helperText="Smaller changes count as no real change"
              sx={{ bgcolor: "white" }}
            />
          </Grid>
        </Grid>
      </Paper>

      {selected ? (
        <Card elevation={0} sx={{ ...ui.surface, mb: 2.5 }}>
          <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 1,
              }}
            >
              <Typography
                variant="h6"
                sx={{ fontWeight: 800, color: "#172B4D" }}
              >
                {selected.column}
              </Typography>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                <Chip
                  size="small"
                  variant="outlined"
                  color="primary"
                  label={`${labelWith}: n=${selected.statsWith.n}`}
                />
                <Chip
                  size="small"
                  variant="outlined"
                  color="secondary"
                  label={`${labelWithout}: n=${selected.statsWithout.n}`}
                />
                <Chip
                  size="small"
                  color={VERDICT[selected.verdict].color}
                  label={VERDICT[selected.verdict].label}
                />
              </Box>
            </Box>
            <Typography variant="body2" sx={{ mt: 1.5, color: "#334155" }}>
              {describeResult(
                selected,
                level,
                minChangePct,
                labelWith,
                labelWithout,
              )}
            </Typography>
            <Divider sx={{ my: 2 }} />
            <Grid container spacing={3}>
              <Grid item xs={12} md={5}>
                <TableContainer
                  component={Paper}
                  elevation={0}
                  sx={{ border: "1px solid #E5EAF2", borderRadius: 2.5 }}
                >
                  <Table size="small">
                    <TableBody>
                      {[
                        [`Average, ${labelWith}`, fmt(selected.statsWith.mean)],
                        [
                          `Average, ${labelWithout}`,
                          fmt(selected.statsWithout.mean),
                        ],
                        ["Difference", fmt(selected.meanDiff)],
                        [
                          "Change (%)",
                          selected.pctChange === null
                            ? "N/A"
                            : `${fmt(selected.pctChange, 2)}%`,
                        ],
                        [
                          `${Math.round(level * 100)}% credible range`,
                          `[${fmt(selected.ciLower)}, ${fmt(selected.ciUpper)}]`,
                        ],
                        ["Probability higher", pct(selected.pPositive)],
                        ["Probability lower", pct(selected.pNegative)],
                        ["Effect size", fmt(selected.effectSize, 2)],
                      ].map(([label, value]) => (
                        <TableRow key={label}>
                          <TableCell sx={{ color: "#475569" }}>
                            {label}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600 }}>
                            {value}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Grid>
              <Grid item xs={12} md={7}>
                <Typography
                  variant="body2"
                  sx={{ fontWeight: 650, color: "#475569", mb: 0.5 }}
                >
                  Likely values of the difference
                </Typography>
                {selectedDraws && (
                  <DifferencePlot
                    draws={selectedDraws}
                    ciLower={selected.ciLower}
                    ciUpper={selected.ciUpper}
                  />
                )}
                <Typography variant="caption" sx={{ color: "#94A3B8" }}>
                  The dark bars are the {Math.round(level * 100)}% credible
                  range. If the dashed line at 0 sits outside it, a change is
                  likely.
                </Typography>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      ) : (
        <Alert severity="warning" sx={{ mb: 2.5 }}>
          This column has too few numeric values in one of the datasets, so it
          was skipped.
        </Alert>
      )}

      <Card elevation={0} sx={ui.surface}>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 1.5,
              mb: 2,
            }}
          >
            <Typography variant="h6" sx={{ fontWeight: 800, color: "#172B4D" }}>
              All columns
            </Typography>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={filter}
              onChange={(e, v) => {
                if (v) {
                  setFilter(v);
                  setPage(1);
                }
              }}
            >
              <ToggleButton value="all" sx={{ textTransform: "none" }}>
                All
              </ToggleButton>
              <ToggleButton value="increase" sx={{ textTransform: "none" }}>
                Increase
              </ToggleButton>
              <ToggleButton value="decrease" sx={{ textTransform: "none" }}>
                Decrease
              </ToggleButton>
              <ToggleButton value="uncertain" sx={{ textTransform: "none" }}>
                No clear change
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <TableContainer
            component={Paper}
            elevation={0}
            sx={{
              border: "1px solid #E5EAF2",
              borderRadius: 2.5,
              overflowX: "auto",
            }}
          >
            <Table size="small">
              <TableHead sx={{ backgroundColor: "#F6F8FB" }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Column</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    Difference
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    Change (%)
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    Credible range
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    Prob. increase
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    Prob. decrease
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Result</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pageRows.map((r) => (
                  <TableRow
                    key={r.column}
                    hover
                    selected={r.column === selectedColumn}
                    onClick={() => setSelectedColumn(r.column)}
                    sx={{ cursor: "pointer" }}
                  >
                    <TableCell>{r.column}</TableCell>
                    <TableCell align="right">{fmt(r.meanDiff)}</TableCell>
                    <TableCell align="right">
                      {r.pctChange === null ? "N/A" : fmt(r.pctChange, 2)}
                    </TableCell>
                    <TableCell align="right">
                      [{fmt(r.ciLower, 3)}, {fmt(r.ciUpper, 3)}]
                    </TableCell>
                    <TableCell align="right">{pct(r.pUp)}</TableCell>
                    <TableCell align="right">{pct(r.pDown)}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        variant="outlined"
                        color={VERDICT[r.verdict].color}
                        label={VERDICT[r.verdict].label}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {!pageRows.length && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      align="center"
                      sx={{ color: "text.secondary", py: 3 }}
                    >
                      No columns in this group.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {filtered.length > rowsPerPage && (
            <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
              <Pagination
                count={Math.ceil(filtered.length / rowsPerPage)}
                page={page}
                onChange={(e, v) => setPage(v)}
                size="small"
                color="primary"
              />
            </Box>
          )}

          <Typography
            variant="caption"
            sx={{ color: "#94A3B8", display: "block", mt: 2 }}
          >
            Sorted by effect size (difference relative to normal variation), so
            columns with large units do not dominate.
          </Typography>
        </CardContent>
      </Card>

      <Alert severity="info" sx={{ mt: 2.5 }}>
        <AlertTitle>How to read this</AlertTitle>
        Uses a Bayesian comparison of averages with a default (non-informative)
        prior and 10,000 posterior samples. Rows recorded close together in time
        are not fully independent, so probabilities can look more certain than
        they are. Changes in load, raw material or weather between the two
        periods are not accounted for.
      </Alert>
    </Box>
  );
};

export default BayesianTab;
