import { useState, type ReactNode } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";

import AppBar from "@mui/material/AppBar";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Toolbar from "@mui/material/Toolbar";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";

import ProductSwitcher from "./ProductSwitcher";
import { useAuth } from "@/lib/auth";
import { useSelectedProduct } from "@/lib/selectedProduct";

interface Props {
  mode: "light" | "dark";
  onToggleMode: () => void;
  children: ReactNode;
}

export default function AppShell({ mode, onToggleMode, children }: Props) {
  const { user, logOut } = useAuth();
  const { selected } = useSelectedProduct();
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  const initials = (user?.name ?? "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  const signOut = async () => {
    setAnchor(null);
    await logOut();
    navigate("/", { replace: true });
  };

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar
        position="sticky"
        elevation={0}
        color="transparent"
        sx={{ bgcolor: "background.paper", borderBottom: 1, borderColor: "divider" }}
      >
        {/* Three columns rather than flex with a spacer. The outer two are
            1fr each, so the navigation sits on the true centre of the page
            and does not shift when a longer name appears on the right. */}
        <Toolbar
          variant="dense"
          sx={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
            gap: 1,
          }}
        >
          <Stack
            direction="row"
            spacing={1.5}
            alignItems="center"
            sx={{ justifySelf: "start", minWidth: 0 }}
          >
            <Typography
              component={RouterLink}
              to="/home"
              variant="subtitle2"
              sx={{
                fontWeight: 700,
                color: "text.primary",
                textDecoration: "none",
                flexShrink: 0,
              }}
            >
              Outreach
            </Typography>
            <ProductSwitcher />
          </Stack>

          <Stack direction="row" spacing={1} sx={{ justifySelf: "center" }}>
            <Button component={RouterLink} to="/home" size="small" color="inherit">
              Home
            </Button>
            <Button component={RouterLink} to="/settings/product" size="small" color="inherit">
              Products
            </Button>
            <Button component={RouterLink} to="/new" size="small" variant="outlined">
              New product
            </Button>
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center" sx={{ justifySelf: "end" }}>
            <Tooltip title={mode === "light" ? "Dark theme" : "Light theme"}>
              <IconButton size="small" onClick={onToggleMode}>
                {mode === "light" ? (
                  <DarkModeOutlinedIcon fontSize="small" />
                ) : (
                  <LightModeOutlinedIcon fontSize="small" />
                )}
              </IconButton>
            </Tooltip>

            <Tooltip title={user?.name ?? "Account"}>
              <IconButton size="small" onClick={(e) => setAnchor(e.currentTarget)}>
                <Avatar
                  sx={{
                    width: 28,
                    height: 28,
                    fontSize: 12,
                    fontWeight: 700,
                    bgcolor: "primary.main",
                    color: "primary.contrastText",
                  }}
                >
                  {initials}
                </Avatar>
              </IconButton>
            </Tooltip>

            <Menu
              anchorEl={anchor}
              open={Boolean(anchor)}
              onClose={() => setAnchor(null)}
              anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
              transformOrigin={{ vertical: "top", horizontal: "right" }}
            >
              <MenuItem disabled sx={{ opacity: "1 !important" }}>
                <ListItemText
                  primary={user?.name}
                  secondary={user?.email}
                  slotProps={{
                    primary: { fontWeight: 620, fontSize: 14 },
                    secondary: { fontSize: 12 },
                  }}
                />
              </MenuItem>
              <Divider />
              <MenuItem onClick={signOut}>Sign out</MenuItem>
            </Menu>
          </Stack>
        </Toolbar>

        {/* What the selected product is, in its owner's words.
            A second row rather than squeezed into the toolbar: descriptions
            run to a paragraph, and truncating one to fit beside a name
            leaves three words and an ellipsis, which tells nobody anything. */}
        {selected?.description && (
          <>
            <Divider />
            <Box sx={{ px: { xs: 2, sm: 3 }, py: 0.75, bgcolor: "action.hover" }}>
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  lineHeight: 1.5,
                }}
              >
                {selected.description}
              </Typography>
            </Box>
          </>
        )}
      </AppBar>

      {children}
    </Box>
  );
}
