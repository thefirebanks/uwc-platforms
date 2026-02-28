import { type SxProps, type Theme } from "@mui/material";

export const SHARED_FORM_TEXT_FIELD_SX: SxProps<Theme> = {
  "& .MuiOutlinedInput-root": {
    fontFamily: "var(--font-body)",
    fontSize: "0.85rem",
    borderRadius: "8px",
    backgroundColor: "var(--surface, #FFFFFF)",
    "& fieldset": { borderColor: "var(--sand, #EBE6E0)", borderWidth: "1.5px" },
    "&:hover fieldset": { borderColor: "var(--muted, #9A9590)" },
    "&.Mui-focused fieldset": { borderColor: "var(--maroon, #9A2545)" },
  },
};
