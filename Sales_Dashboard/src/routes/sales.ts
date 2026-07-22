import { Router } from "express";
import { verifyToken } from "../middleware/auth";
import {
  getKpi,
  getByRegion,
  getByProduct,
  getMtdTargetByProduct,
  getRegionProductHeatmap,
  getByArea,
  getByTerritory,
  getCustomers,
  getInsights,
  getAvailableDates,
  getFilterOptions,
  getDeepInsights,
  getYesterdayKpi,
  getYesterdayByRegion,
  getYesterdayByProduct,
  getYesterdayByTerritory,
  getYesterdayCustomers,
  getByCustomerType,
} from "../controllers/salesController";

const router = Router();

// All routes protected by JWT
router.use(verifyToken);

// Get all available dates (for date picker in frontend)
router.get("/sales/dates", getAvailableDates);
//FilterOptions
router.get("/sales/filter-options", getFilterOptions);

// KPI cards
router.get("/sales/kpi", getKpi);

// Charts
router.get("/sales/by-region", getByRegion);
router.get("/sales/by-product", getByProduct);
router.get("/sales/mtd-target-by-product", getMtdTargetByProduct);
router.get("/sales/region-product-heatmap", getRegionProductHeatmap);
router.get("/sales/by-area", getByArea);
router.get("/sales/by-territory", getByTerritory);
router.get("/sales/by-customer-type", getByCustomerType);

// Customer analytics
router.get("/sales/customers", getCustomers);

// Insights
router.get("/sales/insights", getInsights);

//deepInsights
router.get("/sales/insights/deep", getDeepInsights);

// D-1 daily report (Yesterday Sales vs Target) — separate from the MTD
// views above; each upload's *_yesterday columns are that day's actual
// sales, so these are correct for both a single date and a date range.
router.get("/sales/yesterday/kpi", getYesterdayKpi);
router.get("/sales/yesterday/by-region", getYesterdayByRegion);
router.get("/sales/yesterday/by-product", getYesterdayByProduct);
router.get("/sales/yesterday/by-territory", getYesterdayByTerritory);
router.get("/sales/yesterday/customers", getYesterdayCustomers);

export default router;
