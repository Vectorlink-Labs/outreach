import { useEffect, useState } from "react";
import { Link as RouterLink } from "react-router-dom";

import Alert from "@mui/material/Alert";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import AddIcon from "@mui/icons-material/Add";

import { ErrorBlock, Loading, PageHeader } from "@/components/StateBlocks";
import { useAuth } from "@/lib/auth";
import { productApi, type Product } from "@/lib/productApi";
import { MONO } from "@/styles/theme";

const SELECTED_KEY = "outreach.selectedProduct.v1";

/**
 * Where signing in lands you.
 *
 * Your account, and the products you have already made. Choosing one is
 * meant to open that product's workspace; that workspace is not designed
 * yet, so for now selecting a product shows the product.
 */
export default function HomeRoute() {
  const { user } = useAuth();

  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    productApi
      .list()
      .then((list) => {
        if (cancelled) return;
        setProducts(list);

        // Reopen whatever they were last looking at, when it still exists.
        const remembered = localStorage.getItem(SELECTED_KEY) ?? "";
        const valid = list.some((p) => p.id === remembered);
        setSelectedId(valid ? remembered : (list[0]?.id ?? ""));
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const choose = (id: string) => {
    setSelectedId(id);
    try {
      localStorage.setItem(SELECTED_KEY, id);
    } catch {
      /* private browsing */
    }
  };

  const selected = products?.find((p) => p.id === selectedId) ?? null;
  const initials = (user?.name ?? "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <Box sx={{ maxWidth: 720, mx: "auto", px: 2, py: { xs: 4, md: 6 } }}>
      <PageHeader eyebrow="Signed in" title={`Hello, ${user?.name ?? ""}`} />

      {/* ------------------------------------------------ the account */}
      <Paper variant="outlined" sx={{ p: 2.5, mb: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Avatar sx={{ bgcolor: "primary.main", color: "primary.contrastText", fontWeight: 700 }}>
            {initials}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 620 }}>{user?.name}</Typography>
            <Typography variant="caption" sx={{ color: "text.secondary", fontFamily: MONO }}>
              {user?.email}
            </Typography>
          </Box>
        </Stack>
      </Paper>

      {/* ------------------------------------------------ the products */}
      {error && <ErrorBlock message={error} />}
      {!error && !products && <Loading label="Loading your products" />}

      {products?.length === 0 && (
        <Paper variant="outlined" sx={{ p: 5, textAlign: "center" }}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            No products yet
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ maxWidth: "42ch", mx: "auto", mb: 3 }}
          >
            Add your first one and we will read its website to learn what it does.
          </Typography>
          <Button component={RouterLink} to="/new" variant="contained" startIcon={<AddIcon />}>
            Add a product
          </Button>
        </Paper>
      )}

      {products && products.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2.5 }}>
          <Stack spacing={2.5}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="flex-start">
              <FormControl fullWidth size="small">
                <InputLabel id="product-label">Product</InputLabel>
                <Select
                  labelId="product-label"
                  label="Product"
                  value={selectedId}
                  onChange={(e) => choose(e.target.value)}
                >
                  {products.map((product) => (
                    <MenuItem key={product.id} value={product.id}>
                      {product.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Button
                component={RouterLink}
                to="/new"
                variant="outlined"
                startIcon={<AddIcon />}
                sx={{ flexShrink: 0 }}
              >
                New product
              </Button>
            </Stack>

            {selected && (
              <>
                <Divider />

                <Box>
                  <Typography
                    variant="overline"
                    sx={{ fontSize: 9.5, letterSpacing: ".12em", color: "text.secondary" }}
                  >
                    Selected product
                  </Typography>
                  <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 0.5 }}>
                    <Typography sx={{ fontSize: 22, fontWeight: 660, letterSpacing: "-0.02em" }}>
                      {selected.name}
                    </Typography>
                    {selected.state === "ready" && (
                      <Chip size="small" label="website read" color="success" variant="outlined" />
                    )}
                  </Stack>
                </Box>

                <Alert severity="info" variant="outlined">
                  The workspace for a product is not designed yet, so this shows the
                  name and nothing more. The marketing plan and the platform results
                  land here.
                </Alert>
              </>
            )}
          </Stack>
        </Paper>
      )}
    </Box>
  );
}
