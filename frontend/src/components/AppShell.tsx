import type { ReactNode } from "react";
import { Link as RouterLink } from "react-router-dom";

import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Toolbar from "@mui/material/Toolbar";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";


interface Props {
  mode: "light" | "dark";
  onToggleMode: () => void;
  children: ReactNode;
}

export default function AppShell({ mode, onToggleMode, children }: Props) {
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar
        position="sticky"
        elevation={0}
        color="transparent"
        sx={{ bgcolor: "background.paper", borderBottom: 1, borderColor: "divider" }}
      >
        <Toolbar variant="dense" sx={{ gap: 1 }}>
          <Typography
            component={RouterLink}
            to="/"
            variant="subtitle2"
            sx={{ fontWeight: 700, color: "text.primary", textDecoration: "none" }}
          >
            Outreach
          </Typography>

          <Box sx={{ flexGrow: 1 }} />

          <Button component={RouterLink} to="/briefs" size="small" color="inherit">
            Briefs
          </Button>
          <Button component={RouterLink} to="/settings/product" size="small" color="inherit">
            Product
          </Button>
          <Button component={RouterLink} to="/" size="small" variant="outlined">
            New search
          </Button>

          <Tooltip title={mode === "light" ? "Dark theme" : "Light theme"}>
            <IconButton size="small" onClick={onToggleMode} sx={{ ml: 0.5 }}>
              {mode === "light" ? (
                <DarkModeOutlinedIcon fontSize="small" />
              ) : (
                <LightModeOutlinedIcon fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      {children}
    </Box>
  );
}
