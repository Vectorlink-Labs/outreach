import { createTheme, type Theme } from "@mui/material/styles";

/**
 * One theme, two colour schemes. Every colour in the app comes from here.
 * No component hard-codes a hex value.
 */
export function createAppTheme(mode: "light" | "dark"): Theme {
  const light = {
    primary: { main: "#1C5A4B", contrastText: "#FFFFFF" },
    secondary: { main: "#835426", contrastText: "#FFFFFF" },
    background: { default: "#EEF1F4", paper: "#FFFFFF" },
    text: { primary: "#0E151B", secondary: "#53616D" },
    divider: "#D7DFE6",
    success: { main: "#0E7350" },
    warning: { main: "#94600A" },
    error: { main: "#A5323C" },
    info: { main: "#28588F" },
  };

  const dark = {
    primary: { main: "#43AE90", contrastText: "#05211A" },
    secondary: { main: "#C79A5C", contrastText: "#1D1508" },
    background: { default: "#090C10", paper: "#121820" },
    text: { primary: "#E9EEF3", secondary: "#93A1AF" },
    divider: "#232D3A",
    success: { main: "#4CBE92" },
    warning: { main: "#D9A04B" },
    error: { main: "#ED797D" },
    info: { main: "#7BA6DC" },
  };

  return createTheme({
    palette: { mode, ...(mode === "light" ? light : dark) },
    shape: { borderRadius: 8 },
    typography: {
      fontFamily:
        '"Segoe UI Variable Text","Segoe UI",system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif',
      h5: { fontWeight: 650, letterSpacing: "-0.022em" },
      h6: { fontWeight: 650, letterSpacing: "-0.015em" },
      subtitle2: { fontWeight: 600, fontSize: 13.5 },
      body2: { fontSize: 13.5 },
      caption: { fontSize: 12.5, lineHeight: 1.5 },
      button: { textTransform: "none", fontWeight: 600 },
    },
    components: {
      MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
      MuiTextField: { defaultProps: { size: "small", fullWidth: true } },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: { root: { paddingInline: 20, paddingBlock: 9 } },
      },
      MuiChip: {
        styleOverrides: { root: { borderRadius: 6, fontWeight: 500 }, label: { paddingInline: 10 } },
      },
      MuiFormHelperText: {
        styleOverrides: { root: { marginLeft: 0, marginTop: 6, lineHeight: 1.5 } },
      },
    },
  });
}

/** Used wherever digits have to line up or a hash is shown. */
export const MONO = '"Cascadia Mono",Consolas,ui-monospace,"SF Mono",monospace';
