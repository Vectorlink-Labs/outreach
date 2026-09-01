import { useState } from "react";
import { useNavigate } from "react-router-dom";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import AddIcon from "@mui/icons-material/Add";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

import { useSelectedProduct } from "@/lib/selectedProduct";
import { MONO } from "@/styles/theme";

/**
 * Which product you are working on, in the top bar.
 *
 * A Menu rather than a Select. A Select shows one line per option, and the
 * useful thing to see when switching is the domain underneath the name -
 * two products can easily be called the same thing, and their websites
 * never are.
 */
export default function ProductSwitcher() {
  const { products, selected, select, loading } = useSelectedProduct();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const navigate = useNavigate();

  // Nothing to switch between. The empty state on the home page is where
  // somebody is told to add one, so the bar stays quiet about it.
  if (loading || products.length === 0) return null;

  const choose = (id: string) => {
    select(id);
    setAnchor(null);
  };

  return (
    <>
      <Button
        onClick={(e) => setAnchor(e.currentTarget)}
        endIcon={<ExpandMoreIcon />}
        color="inherit"
        sx={{
          maxWidth: { xs: 180, sm: 300 },
          py: 0.5,
          px: 1.25,
          borderRadius: 1.5,
          border: 1,
          borderColor: "divider",
          "&:hover": { bgcolor: "action.hover" },
        }}
      >
        <Box sx={{ minWidth: 0, textAlign: "left" }}>
          <Typography
            sx={{ fontWeight: 650, fontSize: 13.5, lineHeight: 1.25 }}
            noWrap
          >
            {selected?.name ?? "Choose a product"}
          </Typography>
          {selected && (
            <Typography
              sx={{
                fontFamily: MONO,
                fontSize: 10.5,
                lineHeight: 1.3,
                color: "text.secondary",
              }}
              noWrap
            >
              {selected.domain}
            </Typography>
          )}
        </Box>
      </Button>

      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { sx: { minWidth: 280, maxWidth: 380 } } }}
      >
        {products.map((product) => (
          <MenuItem
            key={product.id}
            selected={product.id === selected?.id}
            onClick={() => choose(product.id)}
          >
            <ListItemText
              primary={
                <Stack direction="row" alignItems="center" gap={1}>
                  <Box component="span" sx={{ fontWeight: 620 }}>
                    {product.name}
                  </Box>
                  {product.state !== "ready" && (
                    <Chip
                      size="small"
                      label={product.state}
                      variant="outlined"
                      sx={{ height: 18, fontSize: 10 }}
                    />
                  )}
                </Stack>
              }
              secondary={product.domain}
              slotProps={{
                primary: { fontSize: 14 },
                secondary: { fontSize: 11.5, fontFamily: MONO },
              }}
            />
          </MenuItem>
        ))}

        <Divider />
        <MenuItem
          onClick={() => {
            setAnchor(null);
            navigate("/new");
          }}
        >
          <AddIcon fontSize="small" sx={{ mr: 1.25, color: "text.secondary" }} />
          <Typography sx={{ fontSize: 14 }}>New product</Typography>
        </MenuItem>
      </Menu>
    </>
  );
}
