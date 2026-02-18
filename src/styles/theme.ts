import { createTheme } from "@mui/material/styles";

// UWC Maroon Studio Design System
// Colors from design spec
const colors = {
  uwcMaroon: "#9A2545",
  uwcMaroonSoft: "#FAF0F2",
  uwcMaroonDark: "#7D1E38",
  uwcBlue: "#004E89",
  uwcBlueSoft: "#EDF4F9",
  ink: "#2C2825",
  paper: "#FFFBF8",
  cream: "#FBF7F4",
  sand: "#EBE6E0",
  muted: "#7A7572",
  success: "#2D6A4F",
  successSoft: "#EBF5F0",
  warning: "#B45309",
  warningSoft: "#FEF3C7",
};

// Subtle border radius for sleek but soft look
const borderRadius = 6;

export const appTheme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: colors.uwcMaroon,
      light: colors.uwcMaroonSoft,
      dark: colors.uwcMaroonDark,
    },
    secondary: {
      main: colors.uwcBlue,
      light: colors.uwcBlueSoft,
    },
    background: {
      default: colors.paper,
      paper: "#FFFFFF",
    },
    text: {
      primary: colors.ink,
      secondary: colors.muted,
    },
    success: {
      main: colors.success,
      light: colors.successSoft,
    },
    warning: {
      main: colors.warning,
      light: colors.warningSoft,
    },
    divider: colors.sand,
  },
  shape: {
    borderRadius: borderRadius,
  },
  typography: {
    // Base font: Sans-serif for body/UI
    fontFamily: "var(--font-inter), 'Inter', -apple-system, sans-serif",
    // Headings: Serif for editorial feel
    h1: {
      fontFamily: "var(--font-newsreader), 'Newsreader', Georgia, serif",
      fontWeight: 400,
      letterSpacing: "-0.02em",
    },
    h2: {
      fontFamily: "var(--font-newsreader), 'Newsreader', Georgia, serif",
      fontWeight: 400,
      letterSpacing: "-0.01em",
    },
    h3: {
      fontFamily: "var(--font-newsreader), 'Newsreader', Georgia, serif",
      fontWeight: 400,
    },
    h4: {
      fontFamily: "var(--font-newsreader), 'Newsreader', Georgia, serif",
      fontWeight: 500,
    },
    h5: {
      fontFamily: "var(--font-newsreader), 'Newsreader', Georgia, serif",
      fontWeight: 500,
    },
    h6: {
      fontFamily: "var(--font-newsreader), 'Newsreader', Georgia, serif",
      fontWeight: 500,
    },
    body1: {
      fontWeight: 400,
    },
    body2: {
      fontWeight: 400,
    },
    button: {
      textTransform: "none",
      fontWeight: 500,
    },
    overline: {
      fontWeight: 600,
      letterSpacing: "0.1em",
      textTransform: "uppercase",
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: colors.paper,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          boxShadow: "none",
          border: `1px solid ${colors.sand}`,
          borderRadius: borderRadius,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: "none",
          border: `1px solid ${colors.sand}`,
          borderRadius: borderRadius,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: borderRadius,
          padding: "10px 20px",
          fontWeight: 500,
          minWidth: "auto",
        },
        sizeSmall: {
          padding: "6px 14px",
          fontSize: "0.8125rem",
        },
        sizeLarge: {
          padding: "14px 28px",
        },
        containedPrimary: {
          "&:hover": {
            backgroundColor: colors.uwcMaroonDark,
          },
        },
        outlined: {
          borderColor: colors.sand,
          borderWidth: "1.5px",
          "&:hover": {
            borderWidth: "1.5px",
            borderColor: colors.muted,
            backgroundColor: colors.cream,
          },
        },
        outlinedSuccess: {
          borderColor: colors.success,
          color: colors.success,
          "&:hover": {
            borderColor: colors.success,
            backgroundColor: colors.successSoft,
          },
        },
        outlinedWarning: {
          borderColor: colors.warning,
          color: colors.warning,
          "&:hover": {
            borderColor: colors.warning,
            backgroundColor: colors.warningSoft,
          },
        },
        // Text buttons - make them clearly clickable
        text: {
          padding: "8px 16px",
          fontWeight: 500,
          position: "relative",
          "&:hover": {
            backgroundColor: colors.uwcMaroonSoft,
          },
          // Underline effect for text buttons
          "&::after": {
            content: '""',
            position: "absolute",
            bottom: 6,
            left: 16,
            right: 16,
            height: "1px",
            backgroundColor: "currentColor",
            opacity: 0.3,
          },
        },
        textPrimary: {
          color: colors.uwcMaroon,
          "&:hover": {
            backgroundColor: colors.uwcMaroonSoft,
          },
        },
        textSecondary: {
          color: colors.uwcBlue,
          "&:hover": {
            backgroundColor: colors.uwcBlueSoft,
          },
        },
      },
    },
    MuiLink: {
      styleOverrides: {
        root: {
          color: colors.uwcMaroon,
          fontWeight: 500,
          textDecorationColor: `${colors.uwcMaroon}40`,
          textUnderlineOffset: "3px",
          "&:hover": {
            textDecorationColor: colors.uwcMaroon,
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            backgroundColor: "#FFFFFF",
            borderRadius: borderRadius,
            "& fieldset": {
              borderColor: colors.sand,
              borderWidth: "1.5px",
            },
            "&:hover fieldset": {
              borderColor: colors.muted,
            },
            "&.Mui-focused fieldset": {
              borderColor: colors.uwcMaroon,
              borderWidth: "1.5px",
            },
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: "#FFFFFF",
          borderRadius: borderRadius,
          "& fieldset": {
            borderColor: colors.sand,
            borderWidth: "1.5px",
          },
          "&:hover fieldset": {
            borderColor: colors.muted,
          },
          "&.Mui-focused fieldset": {
            borderColor: colors.uwcMaroon,
            borderWidth: "1.5px",
          },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: {
          borderRadius: borderRadius,
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: colors.muted,
          fontWeight: 500,
          fontSize: "0.875rem",
        },
      },
    },
    MuiFormControlLabel: {
      styleOverrides: {
        root: {
          marginLeft: 0,
          marginRight: 16,
        },
        label: {
          fontSize: "0.875rem",
          fontWeight: 500,
          marginLeft: 8,
        },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        root: {
          padding: 8,
        },
        track: {
          borderRadius: 12,
          backgroundColor: colors.sand,
        },
        thumb: {
          boxShadow: "none",
        },
        switchBase: {
          "&.Mui-checked": {
            "& + .MuiSwitch-track": {
              backgroundColor: colors.uwcMaroon,
              opacity: 1,
            },
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          fontWeight: 600,
          fontSize: "0.6875rem",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        },
        colorPrimary: {
          backgroundColor: colors.uwcMaroonSoft,
          color: colors.uwcMaroon,
        },
        colorSuccess: {
          backgroundColor: colors.successSoft,
          color: colors.success,
        },
        colorWarning: {
          backgroundColor: colors.warningSoft,
          color: colors.warning,
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: colors.paper,
          borderBottom: `1px solid ${colors.sand}`,
          boxShadow: "none",
        },
      },
    },
    MuiToolbar: {
      styleOverrides: {
        root: {
          paddingLeft: 56,
          paddingRight: 56,
        },
      },
    },
    MuiTableContainer: {
      styleOverrides: {
        root: {
          borderRadius: borderRadius,
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          backgroundColor: colors.cream,
          "& .MuiTableCell-head": {
            fontWeight: 600,
            color: colors.ink,
            borderBottom: `1px solid ${colors.sand}`,
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: `1px solid ${colors.sand}`,
          padding: "14px 16px",
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: colors.sand,
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          backgroundColor: colors.sand,
          borderRadius: 2,
          height: 4,
        },
        barColorPrimary: {
          borderRadius: 2,
          background: `linear-gradient(90deg, ${colors.uwcMaroon} 0%, ${colors.uwcBlue} 100%)`,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 500,
          "&.Mui-selected": {
            color: colors.uwcMaroon,
          },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          backgroundColor: colors.uwcMaroon,
          borderRadius: 2,
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: borderRadius,
        },
        standardSuccess: {
          backgroundColor: colors.successSoft,
          color: colors.success,
        },
        standardWarning: {
          backgroundColor: colors.warningSoft,
          color: colors.warning,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: borderRadius,
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          borderRadius: borderRadius,
          border: `1px solid ${colors.sand}`,
          boxShadow: "0 4px 12px rgba(44, 40, 37, 0.08)",
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          fontSize: "0.875rem",
          "&:hover": {
            backgroundColor: colors.cream,
          },
          "&.Mui-selected": {
            backgroundColor: colors.uwcMaroonSoft,
            "&:hover": {
              backgroundColor: colors.uwcMaroonSoft,
            },
          },
        },
      },
    },
  },
});
