import express from "express";
import multer from "multer";

import {
    authenticate,
    authorize
} from "../middleware/auth.middleware.js";

import {
    getAdminTableMetadata,
    getAdminTableData,
    createAdminTableRow
} from "../controllers/admin.controller.js";

import {
    downloadAdminTableTemplate,
    validateAdminTableUpload,
    downloadFailedAdminRows,
    insertValidatedAdminRowsController
} from "../controllers/admin-bulk.controller.js";

const router = express.Router();

const upload =
    multer({
        storage: multer.memoryStorage(),
        limits: {
            fileSize:
                10 * 1024 * 1024
        }
    });

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

router.get(
    "/tables/:table/template",
    authenticate,
    authorize("admin"),
    downloadAdminTableTemplate
);

router.post(
    "/tables/:table/validate",
    authenticate,
    authorize("admin"),
    upload.single("file"),
    validateAdminTableUpload
);

router.get(
    "/tables/:table/validation/:validationId/failed",
    authenticate,
    authorize("admin"),
    downloadFailedAdminRows
);

router.post(
    "/tables/:table",
    authenticate,
    authorize("admin"),
    createAdminTableRow
);

router.post(
    "/tables/:table/validation/:validationId/insert",
    authenticate,
    authorize("admin"),
    insertValidatedAdminRowsController
);

export default router;