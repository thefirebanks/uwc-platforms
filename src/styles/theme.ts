import { createTheme, type PaletteMode } from "@mui/material/styles";

const borderRadius = 8;

const lightColors = {
  uwcMaroon: "#9A2545",
  uwcMaroonSoft: "#FAF0F2",
  uwcMaroonDark: "#7D1E38",
  uwcBlue: "#004E89",
  uwcBlueSoft: "#EDF4F9",
  ink: "#2C2825",
  paper: "#FFFBF8",
  surface: "#FFFFFF",
  cream: "#FBF7F4",
  sand: "#EBE6E0",
  muted: "#9A9590",
  success: "#2D6A4F",
  successSoft: "#E8F5EE",
  warning: "#B45309",
  warningSoft: "#FEF3C7",
  menuShadow: "0 4px 12px rgba(44, 40, 37, 0.08)",
};

const darkColors = {
  uwcMaroon: "#C14A6B",
  uwcMaroonSoft: "rgba(193, 74, 107, 0.18)",
  uwcMaroonDark: "#A33656",
  uwcBlue: "#5C9DD2",
  uwcBlueSoft: "rgba(92, 157, 210, 0.18)",
  ink: "#F2ECE7",
  paper: "#141313",
  surface: "#1D1B1A",
  cream: "#23201E",
  sand: "#3B3532",
  muted: "#B8AEA8",
  success: "#56B589",
  successSoft: "rgba(86, 181, 137, 0.16)",
  warning: "#E6A65C",
  warningSoft: "rgba(230, 166, 92, 0.18)",
  menuShadow: "0 6px 16px rgba(0, 0, 0, 0.32)",
};

function getColors(mode: PaletteMode) {
  return mode === "dark" ? darkColors : lightColors;
}

export function createAppTheme(mode: PaletteMode = "light") {
  const colors = getColors(mode);

  return createTheme({
    palette: {
      mode,
      primary: {
        main: colors.uwcMaroon,
        light: colors.uwcMaroonSoft,
        dark: colors.uwcMaroonDark,
        contrastText: "#FFFFFF",
      },
      secondary: {
        main: colors.uwcBlue,
        light: colors.uwcBlueSoft,
      },
      background: {
        default: colors.paper,
        paper: colors.surface,
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
      borderRadius,
    },
    typography: {
      fontFamily: "var(--font-inter), 'Inter', -apple-system, sans-serif",
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
            color: colors.ink,
            transition: "background-color 160ms ease, color 160ms ease",
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            boxShadow: "none",
            border: `1px solid ${colors.sand}`,
            borderRadius,
            backgroundColor: colors.surface,
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            boxShadow: "none",
            border: `1px solid ${colors.sand}`,
            borderRadius,
            backgroundColor: colors.surface,
          },
        },
      },
      MuiButton: {
        defaultProps: {
          color: "primary",
        },
        styleOverrides: {
          root: {
            borderRadius,
            padding: "10px 20px",
            fontWeight: 500,
            minWidth: "auto",
            "&.MuiButton-contained": {
              color: "#FFFFFF",
            },
          },
          sizeSmall: {
            padding: "6px 14px",
            fontSize: "0.8125rem",
          },
          sizeLarge: {
            padding: "14px 28px",
          },
          containedPrimary: {
            color: "#FFFFFF",
            "&:hover": {
              backgroundColor: colors.uwcMaroonDark,
            },
          },
          outlined: {
            borderColor: colors.sand,
            borderWidth: "1px",
            "&:hover": {
              borderWidth: "1px",
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
          text: {
            padding: "8px 16px",
            fontWeight: 500,
            position: "relative",
            "&:hover": {
              backgroundColor: colors.cream,
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
            textDecorationColor: `${colors.uwcMaroon}66`,
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
              backgroundColor: colors.surface,
              borderRadius,
              fontSize: "0.85rem",
              "& .MuiOutlinedInput-input": {
                padding: "9px 12px",
              },
              "& .MuiOutlinedInput-input::placeholder": {
                fontWeight: 300,
              },
              "& fieldset": {
                borderColor: colors.sand,
                borderWidth: "1.5px",
                transition: "border-color 0.15s, box-shadow 0.15s",
              },
              "&:hover fieldset": {
                borderColor: colors.muted,
              },
              "&.Mui-focused fieldset": {
                borderColor: colors.uwcMaroon,
                borderWidth: "1.5px",
                boxShadow: `0 0 0 3px rgba(154, 37, 69, 0.08)`,
              },
            },
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            backgroundColor: colors.surface,
            borderRadius,
            fontSize: "0.85rem",
            "& .MuiOutlinedInput-input": {
              padding: "9px 12px",
            },
            "& .MuiOutlinedInput-input::placeholder": {
              fontWeight: 300,
            },
            "& fieldset": {
              borderColor: colors.sand,
              borderWidth: "1.5px",
              transition: "border-color 0.15s, box-shadow 0.15s",
            },
            "&:hover fieldset": {
              borderColor: colors.muted,
            },
            "&.Mui-focused fieldset": {
              borderColor: colors.uwcMaroon,
              borderWidth: "1.5px",
              boxShadow: `0 0 0 3px rgba(154, 37, 69, 0.08)`,
            },
          },
        },
      },
      MuiSelect: {
        styleOverrides: {
          root: {
            borderRadius,
          },
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: {
            color: colors.ink,
            fontWeight: 500,
            fontSize: "0.78rem",
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
      MuiFormHelperText: {
        styleOverrides: {
          root: {
            fontSize: "0.7rem",
            marginTop: 3,
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
            backgroundColor: colors.surface,
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
            borderRadius,
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
            borderRadius,
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
            borderRadius,
          },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            borderRadius,
            border: `1px solid ${colors.sand}`,
            boxShadow: colors.menuShadow,
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
}
