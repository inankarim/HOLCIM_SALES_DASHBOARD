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

// Customer analytics
router.get("/sales/customers", getCustomers);

// Insights
router.get("/sales/insights", getInsights);

//deepInsights

router.get("/sales/insights/deep", getDeepInsights);
export default router;
