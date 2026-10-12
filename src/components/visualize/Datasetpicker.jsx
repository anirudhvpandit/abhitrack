import React, { useState, useEffect, useMemo } from "react";
import {
  Paper,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  Button,
  Box,
} from "@mui/material";

const EMPTY = [];

/**
 * Lets a tab choose which two datasets to compare.
 *
 * datasets: [{ name: 'Data 1', sheetName: 'compare-Pre', data: [...rows] }, ...]
 * fallbackA / fallbackB: the old withProductData / withoutProductData props,
 *   used only when fewer than two datasets are supplied.
 */
export const useDatasetPair = (
  datasets = EMPTY,
  fallbackA = EMPTY,
  fallbackB = EMPTY,
) => {
  const [nameA, setNameA] = useState(() => datasets[0]?.name ?? "");
  const [nameB, setNameB] = useState(() => datasets[1]?.name ?? "");
  const namesKey = datasets.map((d) => d.name).join("|");

  // If the available datasets change (e.g. a sheet slot is removed), go back to the first two.
  useEffect(() => {
    if (datasets.length < 2) return;
    const names = datasets.map((d) => d.name);
    let a = names.includes(nameA) ? nameA : null;
    let b = names.includes(nameB) ? nameB : null;
    if (!a) a = names.find((n) => n !== b); // keep A and B different
    if (!b) b = names.find((n) => n !== a);
    if (a !== nameA) setNameA(a);
    if (b !== nameB) setNameB(b);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namesKey]);

  const dsA = datasets.find((d) => d.name === nameA);
  const dsB = datasets.find((d) => d.name === nameB);
  const dataA = useMemo(() => (dsA ? dsA.data : fallbackA), [dsA, fallbackA]);
  const dataB = useMemo(() => (dsB ? dsB.data : fallbackB), [dsB, fallbackB]);

  const hasChoice = datasets.length >= 2;
  const labelOf = (ds, fallback) => (ds ? ds.sheetName || ds.name : fallback);

  return {
    hasChoice,
    nameA,
    nameB,
    setNameA,
    setNameB,
    dataA,
    dataB,
    labelA: hasChoice ? labelOf(dsA, "Dataset A") : "With product",
    labelB: hasChoice ? labelOf(dsB, "Dataset B") : "Without product",
  };
};

const DatasetPicker = ({ datasets = EMPTY, pair }) => {
  if (!pair.hasChoice) return null;

  const optionLabel = (d) =>
    d.sheetName ? `${d.name} (${d.sheetName})` : d.name;

  return (
    <Paper
      elevation={0}
      sx={{
        border: "1px solid #E8EDF5",
        borderRadius: 2.5,
        backgroundColor: "#FAFBFD",
        p: 2,
        mb: 2.5,
      }}
    >
      <Typography
        variant="body2"
        sx={{ fontWeight: 650, color: "#475569", mb: 1.5 }}
      >
        Choose the two datasets to compare
      </Typography>
      <Grid container spacing={2} alignItems="center">
        <Grid item xs={12} sm={5}>
          <FormControl fullWidth size="small" sx={{ bgcolor: "white" }}>
            <InputLabel>Dataset A</InputLabel>
            <Select
              value={pair.nameA}
              label="Dataset A"
              onChange={(e) => pair.setNameA(e.target.value)}
            >
              {datasets.map((d) => (
                <MenuItem
                  key={d.name}
                  value={d.name}
                  disabled={d.name === pair.nameB}
                >
                  {optionLabel(d)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={2}>
          <Box sx={{ display: "flex", justifyContent: "center" }}>
            <Button
              size="small"
              variant="outlined"
              onClick={() => {
                const a = pair.nameA;
                pair.setNameA(pair.nameB);
                pair.setNameB(a);
              }}
              sx={{ textTransform: "none", bgcolor: "white" }}
            >
              Swap
            </Button>
          </Box>
        </Grid>
        <Grid item xs={12} sm={5}>
          <FormControl fullWidth size="small" sx={{ bgcolor: "white" }}>
            <InputLabel>Dataset B</InputLabel>
            <Select
              value={pair.nameB}
              label="Dataset B"
              onChange={(e) => pair.setNameB(e.target.value)}
            >
              {datasets.map((d) => (
                <MenuItem
                  key={d.name}
                  value={d.name}
                  disabled={d.name === pair.nameA}
                >
                  {optionLabel(d)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
      </Grid>
      <Typography
        variant="caption"
        sx={{ color: "#94A3B8", display: "block", mt: 1 }}
      >
        Difference is calculated as A minus B. Use Swap to reverse the
        direction.
      </Typography>
    </Paper>
  );
};

export default DatasetPicker;
