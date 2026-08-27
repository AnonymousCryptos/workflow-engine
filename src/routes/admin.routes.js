import express from "express";

import {
    authenticate,
    authorize
} from "../middleware/auth.middleware.js";

import {
    getAdminTableMetadata,
    getAdminTableData
} from "../controllers/admin.controller.js";

const router = express.Router();

router.get(
    "/tables/:table",
    authenticate,
    authorize("admin"),
    getAdminTableMetadata
);

router.get(
    "/tables/:table/data",
    authenticate,
    authorize("admin"),
    getAdminTableData
);

export default router;