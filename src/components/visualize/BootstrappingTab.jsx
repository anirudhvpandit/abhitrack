import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  TextField,
  Autocomplete,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Alert,
  AlertTitle,
  Pagination,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  ToggleButton,
  ToggleButtonGroup,
  Divider,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormGroup,
  FormControlLabel,
  Checkbox,
  IconButton,
  Tooltip,
  CircularProgress,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import ImageIcon from "@mui/icons-material/Image";
import RefreshIcon from "@mui/icons-material/Refresh";
import ScienceOutlinedIcon from "@mui/icons-material/ScienceOutlined";
import InsightsOutlinedIcon from "@mui/icons-material/InsightsOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import ViewModuleOutlinedIcon from "@mui/icons-material/ViewModuleOutlined";
import ViewListOutlinedIcon from "@mui/icons-material/ViewListOutlined";
import SearchIcon from "@mui/icons-material/Search";
import * as XLSX from "xlsx";
import html2canvas from "html2canvas";
import logo from "../../assets/abhitech-logo.png";
import SaveVisualizationButton from "../SaveVisualizationButton";
import DatasetPicker, { useDatasetPair } from "./Datasetpicker";

const BootstrappingTab = ({
  availableColumns = [],
  withProductData: defaultWithData, // used only if `datasets` is not passed
  withoutProductData: defaultWithoutData,
  datasets,
  clientName = "",
  plantName = "",
  productName = "",
}) => {
  // The user picks Dataset A and Dataset B; the difference is A minus B.
  const pair = useDatasetPair(datasets, defaultWithData, defaultWithoutData);
  const withProductData = pair.dataA;
  const withoutProductData = pair.dataB;
  const labelWith = pair.labelA;
  const labelWithout = pair.labelB;

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

  const [selectedColumn, setSelectedColumn] = useState("");
  const [significantPage, setSignificantPage] = useState(1);
  const [nonSignificantPage, setNonSignificantPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [sortOrder, setSortOrder] = useState("impact");
  const [viewMode, setViewMode] = useState("grid");
  const [isLoading, setIsLoading] = useState(false);
  const [bootstrapAnalysis, setBootstrapAnalysis] = useState({
    significant_impact: [],
    no_significant_impact: [],
    total_columns_analyzed: 0,
  });

  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [downloadOptions, setDownloadOptions] = useState({
    selectedColumns: [],
    statistics: {
      column: true,
      mean_difference: true,
      standard_deviation: true,
      confidence_interval_lower: true,
      confidence_interval_upper: true,
      is_significant: true,
    },
    fileName: "bootstrap_analysis",
  });
  const [columnSearchTerm, setColumnSearchTerm] = useState("");
  const tableRef = useRef(null);

  const performBootstrapAnalysis = useCallback(
    (
      withProduct,
      withoutProduct,
      column,
      nBootstraps = 10000,
      confidenceLevel = 0.95,
    ) => {
      const withValues = withProduct
        .map((row) => row?.[column])
        .filter(
          (val) => val !== null && val !== undefined && !isNaN(Number(val)),
        )
        .map((val) => Number(val));

      const withoutValues = withoutProduct
        .map((row) => row?.[column])
        .filter(
          (val) => val !== null && val !== undefined && !isNaN(Number(val)),
        )
        .map((val) => Number(val));

      if (withValues.length === 0 || withoutValues.length === 0) {
        return null;
      }

      const meanWith =
        withValues.reduce((a, b) => a + b, 0) / withValues.length;
      const meanWithout =
        withoutValues.reduce((a, b) => a + b, 0) / withoutValues.length;
      const observedDiff = meanWith - meanWithout;

      const bootstrapDiffs = [];
      for (let i = 0; i < nBootstraps; i++) {
        const bootWith = Array(withValues.length)
          .fill()
          .map(() => withValues[Math.floor(Math.random() * withValues.length)]);
        const bootWithout = Array(withoutValues.length)
          .fill()
          .map(
            () =>
              withoutValues[Math.floor(Math.random() * withoutValues.length)],
          );

        const bootMeanWith =
          bootWith.reduce((a, b) => a + b, 0) / bootWith.length;
        const bootMeanWithout =
          bootWithout.reduce((a, b) => a + b, 0) / bootWithout.length;
        bootstrapDiffs.push(bootMeanWith - bootMeanWithout);
      }

      bootstrapDiffs.sort((a, b) => a - b);
      const lowerPercentile = (1 - confidenceLevel) / 2;
      const upperPercentile = 1 - lowerPercentile;
      const lowerIndex = Math.floor(bootstrapDiffs.length * lowerPercentile);
      const upperIndex = Math.floor(bootstrapDiffs.length * upperPercentile);

      const ciLower = bootstrapDiffs[lowerIndex];
      const ciUpper = bootstrapDiffs[upperIndex];

      const meanBootstrap =
        bootstrapDiffs.reduce((a, b) => a + b, 0) / bootstrapDiffs.length;
      const variance =
        bootstrapDiffs.reduce(
          (sum, val) => sum + Math.pow(val - meanBootstrap, 2),
          0,
        ) / bootstrapDiffs.length;
      const stdDev = Math.sqrt(variance);

      const isSignificant = ciLower > 0 || ciUpper < 0;

      return {
        column,
        mean_difference: observedDiff,
        standard_deviation: stdDev,
        confidence_interval: {
          lower_bound: ciLower,
          upper_bound: ciUpper,
        },
        is_significant: isSignificant,
        sample_size_with: withValues.length,
        sample_size_without: withoutValues.length,
        n_bootstraps: nBootstraps,
      };
    },
    [],
  );

  const runFullBootstrapAnalysis = useCallback(async () => {
    if (
      !availableColumns.length ||
      !withProductData.length ||
      !withoutProductData.length
    ) {
      return;
    }

    setIsLoading(true);

    const significantResults = [];
    const nonSignificantResults = [];

    const CHUNK_SIZE = 5;
    for (let i = 0; i < availableColumns.length; i += CHUNK_SIZE) {
      const chunk = availableColumns.slice(i, i + CHUNK_SIZE);

      for (const column of chunk) {
        const result = performBootstrapAnalysis(
          withProductData,
          withoutProductData,
          column,
        );
        if (result) {
          if (result.is_significant) {
            significantResults.push(result);
          } else {
            nonSignificantResults.push(result);
          }
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    significantResults.sort(
      (a, b) => Math.abs(b.mean_difference) - Math.abs(a.mean_difference),
    );
    nonSignificantResults.sort(
      (a, b) => Math.abs(b.mean_difference) - Math.abs(a.mean_difference),
    );

    setBootstrapAnalysis({
      significant_impact: significantResults,
      no_significant_impact: nonSignificantResults,
      total_columns_analyzed:
        significantResults.length + nonSignificantResults.length,
    });

    setIsLoading(false);
  }, [
    availableColumns,
    withProductData,
    withoutProductData,
    performBootstrapAnalysis,
  ]);

  useEffect(() => {
    if (
      availableColumns.length > 0 &&
      withProductData.length > 0 &&
      withoutProductData.length > 0
    ) {
      runFullBootstrapAnalysis();
    }
  }, [
    availableColumns,
    withProductData,
    withoutProductData,
    runFullBootstrapAnalysis,
  ]);

  useEffect(() => {
    if (availableColumns.length > 0 && !selectedColumn) {
      setSelectedColumn(availableColumns[0]);
    }
  }, [availableColumns, selectedColumn]);

  const getColumnStatistics = (columnName) => {
    const significantResults = bootstrapAnalysis.significant_impact || [];
    const nonSignificantResults = bootstrapAnalysis.no_significant_impact || [];

    const allResults = [...significantResults, ...nonSignificantResults];
    return allResults.find((result) => result.column === columnName);
  };

  const sortedSignificantColumns = useMemo(() => {
    const significant = bootstrapAnalysis.significant_impact || [];
    return [...significant].sort((a, b) => {
      if (sortOrder === "impact") {
        return (
          Math.abs(b.mean_difference || 0) - Math.abs(a.mean_difference || 0)
        );
      } else if (sortOrder === "alphabetical") {
        return a.column.localeCompare(b.column);
      }
      return 0;
    });
  }, [bootstrapAnalysis.significant_impact, sortOrder]);

  const sortedNonSignificantColumns = useMemo(() => {
    const nonSignificant = bootstrapAnalysis.no_significant_impact || [];
    return [...nonSignificant].sort((a, b) => {
      if (sortOrder === "impact") {
        return (
          Math.abs(b.mean_difference || 0) - Math.abs(a.mean_difference || 0)
        );
      } else if (sortOrder === "alphabetical") {
        return a.column.localeCompare(b.column);
      }
      return 0;
    });
  }, [bootstrapAnalysis.no_significant_impact, sortOrder]);

  const paginatedSignificantColumns = useMemo(() => {
    const startIndex = (significantPage - 1) * itemsPerPage;
    return sortedSignificantColumns.slice(
      startIndex,
      startIndex + itemsPerPage,
    );
  }, [sortedSignificantColumns, significantPage, itemsPerPage]);

  const paginatedNonSignificantColumns = useMemo(() => {
    const startIndex = (nonSignificantPage - 1) * itemsPerPage;
    return sortedNonSignificantColumns.slice(
      startIndex,
      startIndex + itemsPerPage,
    );
  }, [sortedNonSignificantColumns, nonSignificantPage, itemsPerPage]);

  const generateFileName = (visualizationName) => {
    const parts = [];
    if (clientName) parts.push(clientName.replace(/\s+/g, "_"));
    if (plantName) parts.push(plantName.replace(/\s+/g, "_"));
    if (productName) parts.push(productName.replace(/\s+/g, "_"));
    parts.push(visualizationName.replace(/\s+/g, "_"));
    return parts.join("-");
  };

  const handleDownloadTableAsPNG = async () => {
    if (!tableRef.current || !selectedColumn) {
      alert("Please select a column first to download the statistics table.");
      return;
    }

    try {
      const canvas = await html2canvas(tableRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
      });

      const finalCanvas = document.createElement("canvas");
      const finalCtx = finalCanvas.getContext("2d");
      const scaleFactor = 2;

      finalCanvas.width = canvas.width;
      finalCanvas.height = canvas.height + 120 * scaleFactor;
      finalCtx.fillStyle = "white";
      finalCtx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

      finalCtx.fillStyle = "black";
      finalCtx.font = `bold ${18 * scaleFactor}px Arial`;
      finalCtx.textAlign = "center";
      finalCtx.fillText(
        "Bootstrap Difference Analysis",
        finalCanvas.width / 2,
        30 * scaleFactor,
      );

      finalCtx.font = `${14 * scaleFactor}px Arial`;
      finalCtx.fillText(
        `Column: ${selectedColumn}`,
        finalCanvas.width / 2,
        55 * scaleFactor,
      );

      finalCtx.drawImage(canvas, 0, 80 * scaleFactor);

      const watermarkImg = new Image();
      watermarkImg.onload = () => {
        const watermarkWidth = 160 * scaleFactor;
        const watermarkHeight = 36 * scaleFactor;
        const watermarkX =
          finalCanvas.width - watermarkWidth - 10 * scaleFactor;
        const watermarkY = 10 * scaleFactor;

        finalCtx.fillStyle = "rgba(255, 255, 255, 0.95)";
        finalCtx.fillRect(
          watermarkX,
          watermarkY,
          watermarkWidth,
          watermarkHeight,
        );
        finalCtx.strokeStyle = "rgba(0, 0, 0, 0.1)";
        finalCtx.lineWidth = 1 * scaleFactor;
        finalCtx.strokeRect(
          watermarkX,
          watermarkY,
          watermarkWidth,
          watermarkHeight,
        );

        const logoSize = 24 * scaleFactor;
        finalCtx.drawImage(
          watermarkImg,
          watermarkX + 8 * scaleFactor,
          watermarkY + 6 * scaleFactor,
          logoSize,
          logoSize,
        );

        finalCtx.fillStyle = "#666";
        finalCtx.font = `${10 * scaleFactor}px Arial`;
        finalCtx.textAlign = "left";
        finalCtx.fillText(
          "Powered by",
          watermarkX + 40 * scaleFactor,
          watermarkY + 18 * scaleFactor,
        );

        finalCtx.fillStyle = "#1976d2";
        finalCtx.font = `bold ${11 * scaleFactor}px Arial`;
        finalCtx.fillText(
          "Abhitech's AbhiStat",
          watermarkX + 40 * scaleFactor,
          watermarkY + 30 * scaleFactor,
        );

        const link = document.createElement("a");
        const fileName = generateFileName(`Bootstrap_${selectedColumn}`);
        link.download = `${fileName}.png`;
        link.href = finalCanvas.toDataURL("image/png");
        link.click();
      };
      watermarkImg.onerror = () => {
        const watermarkWidth = 160 * scaleFactor;
        const watermarkHeight = 36 * scaleFactor;
        const watermarkX =
          finalCanvas.width - watermarkWidth - 10 * scaleFactor;
        const watermarkY = 10 * scaleFactor;

        finalCtx.fillStyle = "rgba(255, 255, 255, 0.95)";
        finalCtx.fillRect(
          watermarkX,
          watermarkY,
          watermarkWidth,
          watermarkHeight,
        );
        finalCtx.strokeStyle = "rgba(0, 0, 0, 0.1)";
        finalCtx.lineWidth = 1 * scaleFactor;
        finalCtx.strokeRect(
          watermarkX,
          watermarkY,
          watermarkWidth,
          watermarkHeight,
        );

        finalCtx.fillStyle = "#666";
        finalCtx.font = `${10 * scaleFactor}px Arial`;
        finalCtx.textAlign = "left";
        finalCtx.fillText(
          "Powered by",
          watermarkX + 40 * scaleFactor,
          watermarkY + 18 * scaleFactor,
        );

        finalCtx.fillStyle = "#1976d2";
        finalCtx.font = `bold ${11 * scaleFactor}px Arial`;
        finalCtx.fillText(
          "Abhitech's AbhiStat",
          watermarkX + 40 * scaleFactor,
          watermarkY + 30 * scaleFactor,
        );

        const link = document.createElement("a");
        const fileName = generateFileName(`Bootstrap_${selectedColumn}`);
        link.download = `${fileName}.png`;
        link.href = finalCanvas.toDataURL("image/png");
        link.click();
      };
      watermarkImg.src = logo;
    } catch (error) {
      console.error("Error generating PNG:", error);
      alert("Failed to generate PNG. Please try again.");
    }
  };

  const renderBootstrapStatisticsTable = (columnStats) => {
    if (!columnStats) {
      return (
        <Typography
          variant="body2"
          color="text.secondary"
          align="center"
          sx={{ p: { xs: 2, sm: 3 } }}
        >
          No bootstrap statistics available for selected column
        </Typography>
      );
    }

    const {
      mean_difference,
      standard_deviation,
      confidence_interval,
      is_significant,
      sample_size_with,
      sample_size_without,
      n_bootstraps,
    } = columnStats;

    return (
      <Box sx={{ px: { xs: 1, sm: 2 } }}>
        <Box
          sx={{
            mb: { xs: 1.5, sm: 2 },
            display: "flex",
            alignItems: "center",
            gap: 1,
            justifyContent: { xs: "center", sm: "flex-start" },
            flexWrap: "wrap",
          }}
        >
          <Chip
            label={
              is_significant ? "Significant Impact" : "No Significant Impact"
            }
            color={is_significant ? "error" : "success"}
            variant="outlined"
            size="small"
            sx={{ fontSize: { xs: "0.75rem", sm: "0.8125rem" } }}
          />
          <Chip
            label={`${labelWith}: n=${sample_size_with}`}
            variant="outlined"
            size="small"
            color="primary"
            sx={{ fontSize: { xs: "0.75rem", sm: "0.8125rem" } }}
          />
          <Chip
            label={`${labelWithout}: n=${sample_size_without}`}
            variant="outlined"
            size="small"
            color="secondary"
            sx={{ fontSize: { xs: "0.75rem", sm: "0.8125rem" } }}
          />
          <Chip
            label={`Bootstraps: ${n_bootstraps}`}
            variant="outlined"
            size="small"
            sx={{ fontSize: { xs: "0.75rem", sm: "0.8125rem" } }}
          />
        </Box>

        <Box
          sx={{
            mb: 2,
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 1,
          }}
        >
          <SaveVisualizationButton
            elementId="visualization-content"
            fileNamePrefix="bootstrapping"
            variableNames={selectedColumn}
          />
          <Tooltip title="Download Table as PNG">
            <Button
              variant="outlined"
              size="small"
              startIcon={<ImageIcon />}
              onClick={handleDownloadTableAsPNG}
              disabled={!selectedColumn || !columnStats}
              sx={{
                fontSize: { xs: "0.75rem", sm: "0.875rem" },
                height: 32,
              }}
            >
              Download PNG
            </Button>
          </Tooltip>
        </Box>

        <TableContainer
          component={Paper}
          elevation={0}
          sx={{
            overflowX: "auto",
            border: "1px solid #E5EAF2",
            borderRadius: 2.5,
            "& .MuiTableHead-root": { backgroundColor: "#F6F8FB" },
            "& .MuiTableCell-head": {
              backgroundColor: "#F6F8FB",
              color: "#475569",
              fontWeight: 700,
            },
            "& .MuiTableBody-root .MuiTableRow-root:hover": {
              backgroundColor: "#FAFBFD",
            },
          }}
          ref={tableRef}
          className="abhitech-plot-area"
        >
          <Table size="small" sx={{ minWidth: { xs: 280, sm: 400 } }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}>
                  <strong>Statistic</strong>
                </TableCell>
                <TableCell
                  align="right"
                  sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
                >
                  <strong>Value</strong>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow>
                <TableCell sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}>
                  {`Mean Difference (${labelWith} - ${labelWithout})`}
                </TableCell>
                <TableCell
                  align="right"
                  sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
                >
                  {mean_difference?.toFixed(4) || "N/A"}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}>
                  Bootstrap Standard Error
                </TableCell>
                <TableCell
                  align="right"
                  sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
                >
                  {standard_deviation?.toFixed(4) || "N/A"}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}>
                  95% Confidence Interval
                </TableCell>
                <TableCell
                  align="right"
                  sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
                >
                  [{confidence_interval?.lower_bound?.toFixed(4)},{" "}
                  {confidence_interval?.upper_bound?.toFixed(4)}]
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}>
                  Lower Bound (2.5%)
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    color:
                      confidence_interval?.lower_bound > 0
                        ? "error.main"
                        : "text.primary",
                    fontSize: { xs: "0.75rem", sm: "0.875rem" },
                  }}
                >
                  {confidence_interval?.lower_bound?.toFixed(4) || "N/A"}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}>
                  Upper Bound (97.5%)
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    color:
                      confidence_interval?.upper_bound < 0
                        ? "error.main"
                        : "text.primary",
                    fontSize: { xs: "0.75rem", sm: "0.875rem" },
                  }}
                >
                  {confidence_interval?.upper_bound?.toFixed(4) || "N/A"}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    );
  };

  const renderSummaryStats = () => {
    const significantCount = bootstrapAnalysis.significant_impact?.length || 0;
    const nonSignificantCount =
      bootstrapAnalysis.no_significant_impact?.length || 0;
    const totalAnalyzed = bootstrapAnalysis.total_columns_analyzed || 0;
    if (!totalAnalyzed || isLoading) return null;
    const metrics = [
      [
        "Columns analyzed",
        totalAnalyzed,
        "Numeric variables processed",
        <ScienceOutlinedIcon />,
        "#2563EB",
        "#EFF6FF",
      ],
      [
        "Significant impact",
        significantCount,
        `${((significantCount / totalAnalyzed) * 100).toFixed(1)}% of analyzed columns`,
        <ErrorOutlineIcon />,
        "#DC2626",
        "#FEF2F2",
      ],
      [
        "No significant impact",
        nonSignificantCount,
        "Confidence interval crosses zero",
        <CheckCircleOutlineIcon />,
        "#059669",
        "#ECFDF5",
      ],
    ];
    return (
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {metrics.map(([label, value, helper, icon, color, bg]) => (
          <Grid item xs={12} sm={4} key={label}>
            <Paper
              elevation={0}
              sx={{ ...ui.surface, p: 2.25, height: "100%" }}
            >
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 2,
                }}
              >
                <Box>
                  <Typography
                    variant="body2"
                    sx={{ color: "#64748B", fontWeight: 650 }}
                  >
                    {label}
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: { xs: 26, md: 30 },
                      fontWeight: 800,
                      color: "#0F172A",
                      lineHeight: 1.2,
                      mt: 0.4,
                    }}
                  >
                    {value}
                  </Typography>
                  <Typography variant="caption" sx={{ color: "#94A3B8" }}>
                    {helper}
                  </Typography>
                </Box>
                <Box
                  sx={{
                    width: 42,
                    height: 42,
                    borderRadius: 2.25,
                    display: "grid",
                    placeItems: "center",
                    color,
                    bgcolor: bg,
                  }}
                >
                  {icon}
                </Box>
              </Box>
            </Paper>
          </Grid>
        ))}
      </Grid>
    );
  };

  const renderColumnChips = (columns, color, onColumnClick) => {
    if (viewMode === "list") {
      return (
        <TableContainer component={Paper} elevation={0}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}>
                  Column Name
                </TableCell>
                <TableCell
                  align="right"
                  sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
                >
                  Mean Difference
                </TableCell>
                <TableCell
                  align="right"
                  sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
                >
                  95% CI
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {columns.map((result) => (
                <TableRow
                  key={result.column}
                  onClick={() => onColumnClick(result.column)}
                  sx={{
                    cursor: "pointer",
                    "&:hover": { backgroundColor: "action.hover" },
                    backgroundColor:
                      result.column === selectedColumn
                        ? "action.selected"
                        : "inherit",
                  }}
                >
                  <TableCell
                    sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
                  >
                    {result.column}
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
                  >
                    {result.mean_difference?.toFixed(4) || "N/A"}
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
                  >
                    [{result.confidence_interval?.lower_bound?.toFixed(4)},{" "}
                    {result.confidence_interval?.upper_bound?.toFixed(4)}]
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      );
    }

    return (
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          gap: { xs: 0.5, sm: 1 },
          justifyContent: { xs: "center", sm: "flex-start" },
        }}
      >
        {columns.map((result) => (
          <Chip
            key={result.column}
            label={result.column}
            size="small"
            color={color}
            variant={result.column === selectedColumn ? "filled" : "outlined"}
            onClick={() => onColumnClick(result.column)}
            clickable
            sx={{
              fontSize: { xs: "0.72rem", sm: "0.78rem" },
              height: { xs: 30, sm: 34 },
              borderRadius: 1.75,
              fontWeight: result.column === selectedColumn ? 700 : 600,
              transition: "all .18s ease",
              "&:hover": {
                transform: "translateY(-1px)",
                boxShadow: "0 5px 14px rgba(15,23,42,.08)",
              },
              "& .MuiChip-label": {
                px: { xs: 1, sm: 1.5 },
              },
            }}
          />
        ))}
      </Box>
    );
  };

  const renderPaginationControls = (
    currentPage,
    setCurrentPage,
    totalItems,
    label,
  ) => {
    const totalPages = Math.ceil(totalItems / itemsPerPage);

    if (totalPages <= 1) return null;

    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          mt: 2,
          gap: 2,
          flexWrap: "wrap",
        }}
      >
        <Typography
          variant="body2"
          sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
        >
          {label}: {(currentPage - 1) * itemsPerPage + 1}-
          {Math.min(currentPage * itemsPerPage, totalItems)} of {totalItems}
        </Typography>
        <Pagination
          count={totalPages}
          page={currentPage}
          onChange={(event, value) => setCurrentPage(value)}
          size="small"
          color="primary"
          showFirstButton
          showLastButton
        />
      </Box>
    );
  };

  const selectedColumnStats = getColumnStatistics(selectedColumn);

  const handleDownloadExcel = () => {
    const workbook = XLSX.utils.book_new();

    const exportData = [];

    if (downloadOptions.selectedColumns.length > 0) {
      const selectedData = [
        ...(bootstrapAnalysis.significant_impact || []),
        ...(bootstrapAnalysis.no_significant_impact || []),
      ].filter((item) => downloadOptions.selectedColumns.includes(item.column));
      selectedData.forEach((item) => {
        const row = {};
        if (downloadOptions.statistics.column) row["Column"] = item.column;
        if (downloadOptions.statistics.mean_difference)
          row["Mean Difference"] = item.mean_difference;
        if (downloadOptions.statistics.standard_deviation)
          row["Standard Error"] = item.standard_deviation;
        if (downloadOptions.statistics.confidence_interval_lower)
          row["CI Lower (2.5%)"] = item.confidence_interval?.lower_bound;
        if (downloadOptions.statistics.confidence_interval_upper)
          row["CI Upper (97.5%)"] = item.confidence_interval?.upper_bound;
        if (downloadOptions.statistics.is_significant)
          row["Significant Impact"] = item.is_significant ? "Yes" : "No";
        row["Category"] = item.is_significant
          ? "Significant Impact"
          : "No Significant Impact";
        exportData.push(row);
      });
    } else {
      const allData = [
        ...(bootstrapAnalysis.significant_impact || []),
        ...(bootstrapAnalysis.no_significant_impact || []),
      ];
      allData.forEach((item) => {
        const row = {};
        if (downloadOptions.statistics.column) row["Column"] = item.column;
        if (downloadOptions.statistics.mean_difference)
          row["Mean Difference"] = item.mean_difference;
        if (downloadOptions.statistics.standard_deviation)
          row["Standard Error"] = item.standard_deviation;
        if (downloadOptions.statistics.confidence_interval_lower)
          row["CI Lower (2.5%)"] = item.confidence_interval?.lower_bound;
        if (downloadOptions.statistics.confidence_interval_upper)
          row["CI Upper (97.5%)"] = item.confidence_interval?.upper_bound;
        if (downloadOptions.statistics.is_significant)
          row["Significant Impact"] = item.is_significant ? "Yes" : "No";
        row["Category"] = item.is_significant
          ? "Significant Impact"
          : "No Significant Impact";
        exportData.push(row);
      });
    }

    if (exportData.length === 0) {
      alert("No data available for export with current selection.");
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(exportData);

    const columnWidths = Object.keys(exportData[0] || {}).map((key) => ({
      wch: Math.max(key.length, 15),
    }));
    worksheet["!cols"] = columnWidths;

    XLSX.utils.book_append_sheet(workbook, worksheet, "Bootstrap Analysis");

    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
    const fileName = `${downloadOptions.fileName}_${timestamp}.xlsx`;

    XLSX.writeFile(workbook, fileName);
    setDownloadDialogOpen(false);
  };

  const handleStatisticToggle = (statistic) => {
    setDownloadOptions((prev) => ({
      ...prev,
      statistics: {
        ...prev.statistics,
        [statistic]: !prev.statistics[statistic],
      },
    }));
  };

  const handleSelectAllStatistics = (checked) => {
    setDownloadOptions((prev) => ({
      ...prev,
      statistics: {
        column: checked,
        mean_difference: checked,
        standard_deviation: checked,
        confidence_interval_lower: checked,
        confidence_interval_upper: checked,
        is_significant: checked,
      },
    }));
  };

  const getSelectedStatisticsCount = () => {
    return Object.values(downloadOptions.statistics).filter(Boolean).length;
  };

  const getTotalStatisticsCount = () => {
    return Object.keys(downloadOptions.statistics).length;
  };

  const getAllAvailableColumns = () => {
    const significant = bootstrapAnalysis.significant_impact || [];
    const nonSignificant = bootstrapAnalysis.no_significant_impact || [];
    return [...significant, ...nonSignificant].map((item) => item.column);
  };

  const handleColumnToggle = (columnName) => {
    setDownloadOptions((prev) => ({
      ...prev,
      selectedColumns: prev.selectedColumns.includes(columnName)
        ? prev.selectedColumns.filter((col) => col !== columnName)
        : [...prev.selectedColumns, columnName],
    }));
  };

  const handleSelectAllColumns = (checked) => {
    if (checked) {
      setDownloadOptions((prev) => ({
        ...prev,
        selectedColumns: getAllAvailableColumns(),
      }));
    } else {
      setDownloadOptions((prev) => ({
        ...prev,
        selectedColumns: [],
      }));
    }
  };

  const getSelectedColumnsCount = () => {
    return downloadOptions.selectedColumns.length;
  };

  const getTotalColumnsCount = () => {
    return getAllAvailableColumns().length;
  };

  const getFilteredColumns = () => {
    const allColumns = getAllAvailableColumns();
    if (!columnSearchTerm) return allColumns;
    return allColumns.filter((column) =>
      column.toLowerCase().includes(columnSearchTerm.toLowerCase()),
    );
  };

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
          Performing bootstrap analysis on {availableColumns.length} columns...
        </Typography>
        <Typography variant="caption" sx={{ mt: 1, color: "text.secondary" }}>
          This may take a moment depending on the number of columns and data
          size.
        </Typography>
      </Box>
    );
  }

  if (!withProductData.length || !withoutProductData.length) {
    return (
      <Box sx={{ p: 3 }}>
        <DatasetPicker datasets={datasets} pair={pair} />
        <Alert severity="info">
          <AlertTitle>No Data Available</AlertTitle>
          Please make sure both datasets contain data to perform bootstrap
          analysis.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ ...ui.page, p: { xs: 1.5, sm: 2.5, md: 3 } }}>
      <Paper
        elevation={0}
        sx={{
          ...ui.surface,
          p: { xs: 2, md: 2.75 },
          mb: 2.5,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            position: "absolute",
            width: 180,
            height: 180,
            borderRadius: "50%",
            bgcolor: "#EFF6FF",
            right: -70,
            top: -95,
          }}
        />
        <Box
          sx={{
            position: "relative",
            display: "flex",
            alignItems: { xs: "flex-start", md: "center" },
            justifyContent: "space-between",
            flexDirection: { xs: "column", md: "row" },
            gap: 2,
          }}
        >
          <Box sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
            <Box
              sx={{
                width: 46,
                height: 46,
                borderRadius: 2.5,
                display: "grid",
                placeItems: "center",
                bgcolor: "#172B4D",
                color: "white",
              }}
            >
              <InsightsOutlinedIcon />
            </Box>
            <Box>
              <Typography
                variant="h5"
                sx={{
                  fontWeight: 850,
                  color: "#0F172A",
                  letterSpacing: "-.025em",
                  fontSize: { xs: "1.25rem", md: "1.55rem" },
                }}
              >
                Bootstrap Analysis
              </Typography>
              <Typography variant="body2" sx={{ color: "#64748B", mt: 0.25 }}>
                Compare two datasets and identify statistically meaningful
                shifts.
              </Typography>
            </Box>
          </Box>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={runFullBootstrapAnalysis}
            disabled={isLoading}
            sx={{
              borderRadius: 2,
              textTransform: "none",
              fontWeight: 700,
              bgcolor: "white",
            }}
          >
            Refresh analysis
          </Button>
        </Box>
      </Paper>

      <DatasetPicker datasets={datasets} pair={pair} />

      {renderSummaryStats()}

      <Paper elevation={0} sx={{ ...ui.softSurface, p: 2, mb: 2.5 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={7}>
            <Autocomplete
              options={availableColumns}
              value={selectedColumn}
              onChange={(event, newValue) =>
                newValue && setSelectedColumn(newValue)
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Variable to inspect"
                  placeholder="Search variables..."
                  fullWidth
                  size="small"
                />
              )}
              sx={{
                bgcolor: "white",
                "& .MuiOutlinedInput-root": { borderRadius: 2 },
              }}
              disableClearable
              autoHighlight
              openOnFocus
            />
          </Grid>
          <Grid item xs={12} md={5}>
            <Typography
              variant="caption"
              sx={{ color: "#64748B", display: "block" }}
            >
              Method
            </Typography>
            <Typography
              variant="body2"
              sx={{ color: "#334155", fontWeight: 650 }}
            >
              10,000 bootstrap samples · 95% confidence interval
            </Typography>
          </Grid>
        </Grid>
      </Paper>

      <Card elevation={0} sx={{ ...ui.surface }}>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: { xs: "flex-start", sm: "center" },
              flexDirection: { xs: "column", sm: "row" },
              gap: 1,
              mb: 1,
            }}
          >
            <Box>
              <Typography
                variant="h6"
                sx={{ fontWeight: 800, color: "#172B4D" }}
              >
                Bootstrap Difference Analysis
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {`Mean difference between "${labelWith}" and "${labelWithout}".`}
              </Typography>
            </Box>
            {selectedColumn && (
              <Chip
                label={selectedColumn}
                sx={{ bgcolor: "#EFF6FF", color: "#1D4ED8", fontWeight: 700 }}
              />
            )}
          </Box>
          <Divider sx={{ my: 2 }} />
          {renderBootstrapStatisticsTable(selectedColumnStats)}
        </CardContent>
      </Card>

      <Paper elevation={0} sx={{ ...ui.softSurface, mt: 2.5, mb: 2.5, p: 1.5 }}>
        <Grid container spacing={1.5} alignItems="center">
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Items per page</InputLabel>
              <Select
                value={itemsPerPage}
                label="Items per page"
                onChange={(e) => {
                  setItemsPerPage(e.target.value);
                  setSignificantPage(1);
                  setNonSignificantPage(1);
                }}
              >
                <MenuItem value={10}>10</MenuItem>
                <MenuItem value={20}>20</MenuItem>
                <MenuItem value={50}>50</MenuItem>
                <MenuItem value={100}>100</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Sort by</InputLabel>
              <Select
                value={sortOrder}
                label="Sort by"
                onChange={(e) => setSortOrder(e.target.value)}
              >
                <MenuItem value="impact">Impact (High to Low)</MenuItem>
                <MenuItem value="alphabetical">Alphabetical</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <ToggleButtonGroup
              value={viewMode}
              exclusive
              onChange={(e, newMode) => newMode && setViewMode(newMode)}
              size="small"
              fullWidth
            >
              <ToggleButton
                value="grid"
                sx={{ textTransform: "none", gap: 0.75 }}
              >
                <ViewModuleOutlinedIcon fontSize="small" /> Grid
              </ToggleButton>
              <ToggleButton
                value="list"
                sx={{ textTransform: "none", gap: 0.75 }}
              >
                <ViewListOutlinedIcon fontSize="small" /> List
              </ToggleButton>
            </ToggleButtonGroup>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<DownloadIcon />}
              onClick={() => setDownloadDialogOpen(true)}
              fullWidth
              sx={{
                height: 40,
                borderRadius: 2,
                textTransform: "none",
                fontWeight: 700,
              }}
            >
              Export Excel
            </Button>
          </Grid>
        </Grid>
      </Paper>

      <Grid container spacing={2.5}>
        <Grid item xs={12} lg={6}>
          <Card elevation={0} sx={{ ...ui.surface, height: "100%" }}>
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
              <Box
                sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}
              >
                <Box
                  sx={{
                    width: 34,
                    height: 34,
                    display: "grid",
                    placeItems: "center",
                    borderRadius: 2,
                    bgcolor: "#FEF2F2",
                    color: "#DC2626",
                  }}
                >
                  <ErrorOutlineIcon fontSize="small" />
                </Box>
                <Box>
                  <Typography sx={{ fontWeight: 800, color: "#172B4D" }}>
                    Significant Impact
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {sortedSignificantColumns.length} columns
                  </Typography>
                </Box>
              </Box>
              {paginatedSignificantColumns.length ? (
                <>
                  {renderColumnChips(
                    paginatedSignificantColumns,
                    "error",
                    setSelectedColumn,
                  )}
                  {renderPaginationControls(
                    significantPage,
                    setSignificantPage,
                    sortedSignificantColumns.length,
                    "Significant",
                  )}
                </>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No columns show significant impact.
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} lg={6}>
          <Card elevation={0} sx={{ ...ui.surface, height: "100%" }}>
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
              <Box
                sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}
              >
                <Box
                  sx={{
                    width: 34,
                    height: 34,
                    display: "grid",
                    placeItems: "center",
                    borderRadius: 2,
                    bgcolor: "#ECFDF5",
                    color: "#059669",
                  }}
                >
                  <CheckCircleOutlineIcon fontSize="small" />
                </Box>
                <Box>
                  <Typography sx={{ fontWeight: 800, color: "#172B4D" }}>
                    No Significant Impact
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {sortedNonSignificantColumns.length} columns
                  </Typography>
                </Box>
              </Box>
              {paginatedNonSignificantColumns.length ? (
                <>
                  {renderColumnChips(
                    paginatedNonSignificantColumns,
                    "success",
                    setSelectedColumn,
                  )}
                  {renderPaginationControls(
                    nonSignificantPage,
                    setNonSignificantPage,
                    sortedNonSignificantColumns.length,
                    "Non-significant",
                  )}
                </>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  All analyzed columns show significant impact.
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Dialog
        open={downloadDialogOpen}
        onClose={() => setDownloadDialogOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: { borderRadius: 3, boxShadow: "0 24px 70px rgba(15,23,42,.18)" },
        }}
      >
        <DialogTitle sx={{ fontWeight: 800, color: "#172B4D" }}>
          Export Bootstrap Analysis
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 3, mt: 1 }}>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 2,
                mb: 2,
              }}
            >
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Select Columns
              </Typography>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={
                      getSelectedColumnsCount() === getTotalColumnsCount() &&
                      getTotalColumnsCount() > 0
                    }
                    indeterminate={
                      getSelectedColumnsCount() > 0 &&
                      getSelectedColumnsCount() < getTotalColumnsCount()
                    }
                    onChange={(e) => handleSelectAllColumns(e.target.checked)}
                  />
                }
                label={`${getSelectedColumnsCount()}/${getTotalColumnsCount()} selected`}
              />
            </Box>

            <TextField
              fullWidth
              size="small"
              placeholder="Search columns..."
              value={columnSearchTerm}
              onChange={(e) => setColumnSearchTerm(e.target.value)}
              sx={{ mb: 2 }}
              InputProps={{
                startAdornment: (
                  <SearchIcon
                    sx={{ color: "text.secondary", mr: 1, fontSize: 20 }}
                  />
                ),
              }}
            />

            <Box
              sx={{
                maxHeight: 220,
                overflowY: "auto",
                border: "1px solid #E5EAF2",
                borderRadius: 2,
                p: 1,
              }}
            >
              <FormGroup>
                {getFilteredColumns().map((columnName) => {
                  const columnData = [
                    ...(bootstrapAnalysis.significant_impact || []),
                    ...(bootstrapAnalysis.no_significant_impact || []),
                  ].find((item) => item.column === columnName);
                  return (
                    <FormControlLabel
                      key={columnName}
                      control={
                        <Checkbox
                          checked={downloadOptions.selectedColumns.includes(
                            columnName,
                          )}
                          onChange={() => handleColumnToggle(columnName)}
                          size="small"
                        />
                      }
                      label={
                        <Box
                          sx={{ display: "flex", alignItems: "center", gap: 1 }}
                        >
                          <Typography variant="body2">{columnName}</Typography>
                          <Chip
                            label={
                              columnData?.is_significant
                                ? "Significant"
                                : "Non-significant"
                            }
                            color={
                              columnData?.is_significant ? "error" : "success"
                            }
                            variant="outlined"
                            size="small"
                          />
                        </Box>
                      }
                    />
                  );
                })}
              </FormGroup>
            </Box>
          </Box>

          <Box sx={{ mb: 3 }}>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 2,
                mb: 1,
              }}
            >
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Include Statistics
              </Typography>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={
                      getSelectedStatisticsCount() === getTotalStatisticsCount()
                    }
                    indeterminate={
                      getSelectedStatisticsCount() > 0 &&
                      getSelectedStatisticsCount() < getTotalStatisticsCount()
                    }
                    onChange={(e) =>
                      handleSelectAllStatistics(e.target.checked)
                    }
                  />
                }
                label={`${getSelectedStatisticsCount()}/${getTotalStatisticsCount()} selected`}
              />
            </Box>
            <FormGroup>
              {[
                ["column", "Column Name"],
                ["mean_difference", "Mean Difference"],
                ["standard_deviation", "Standard Error"],
                [
                  "confidence_interval_lower",
                  "Confidence Interval Lower Bound (2.5%)",
                ],
                [
                  "confidence_interval_upper",
                  "Confidence Interval Upper Bound (97.5%)",
                ],
                ["is_significant", "Significant Impact (Yes/No)"],
              ].map(([key, label]) => (
                <FormControlLabel
                  key={key}
                  control={
                    <Checkbox
                      checked={downloadOptions.statistics[key]}
                      onChange={() => handleStatisticToggle(key)}
                    />
                  }
                  label={label}
                />
              ))}
            </FormGroup>
          </Box>

          <TextField
            fullWidth
            size="small"
            label="File name"
            value={downloadOptions.fileName}
            onChange={(e) =>
              setDownloadOptions((prev) => ({
                ...prev,
                fileName: e.target.value,
              }))
            }
            helperText="A timestamp will be appended automatically."
          />
        </DialogContent>

        <DialogActions sx={{ p: 2.5 }}>
          <Button
            onClick={() => setDownloadDialogOpen(false)}
            sx={{ textTransform: "none" }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDownloadExcel}
            variant="contained"
            startIcon={<DownloadIcon />}
            disabled={
              getSelectedStatisticsCount() === 0 ||
              getAllAvailableColumns().length === 0
            }
            sx={{ textTransform: "none", borderRadius: 2, fontWeight: 700 }}
          >
            Download Excel
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default BootstrappingTab;
