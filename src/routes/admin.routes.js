import express from "express";

import {
    authenticate,
    authorize
} from "../middleware/auth.middleware.js";

import {
    getAdminTableMetadata,
    getAdminTableData,
    createAdminTableRow
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

router.post(
    "/tables/:table",
    authenticate,
    authorize("admin"),
    createAdminTableRow
);

export default router;