import { createTheme } from "@mui/material/styles";

export const appTheme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#0E7490",
      light: "#67E8F9",
      dark: "#155E75",
    },
    secondary: {
      main: "#FB923C",
    },
    background: {
      default: "#F5F9FC",
      paper: "#FFFFFF",
    },
  },
  shape: {
    borderRadius: 14,
  },
  typography: {
    fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
    h1: { fontWeight: 700 },
    h2: { fontWeight: 700 },
    h3: { fontWeight: 700 },
    button: {
      textTransform: "none",
      fontWeight: 600,
    },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          border: "1px solid rgba(15, 23, 42, 0.06)",
          boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)",
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          paddingInline: 18,
        },
      },
    },
  },
});
