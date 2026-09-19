import XLSX from "xlsx";

import {
    getStockList,
    getStockSummaryService
} from "../services/stock.service.js";

import {
    generateStockPickingPlan,
    getStockPickingPlan
} from "../services/stockPicker.service.js";


export async function getStock(
    req,
    res
) {
    try {
        const {
            search,
            sku,
            godown_id,
            rack_id,
            page,
            limit,
            sort_by,
            sort_order
        } = req.query;

        const result =
            await getStockList({
                search,
                sku,
                godownId:
                    godown_id,
                rackId:
                    rack_id,
                page,
                limit,
                sortBy:
                    sort_by,
                sortOrder:
                    sort_order
            });

        const normalizedPage =
            page === undefined ||
            page === ""
                ? 1
                : Number(page);

        const normalizedLimit =
            limit === undefined ||
            limit === ""
                ? 20
                : Number(limit);

        res.json({
            success: true,
            data: result.rows,
            pagination: {
                page:
                    normalizedPage,
                limit:
                    normalizedLimit,
                total:
                    result.total,
                totalPages:
                    Math.ceil(
                        result.total /
                            normalizedLimit
                    )
            }
        });
    } catch (error) {
        console.error(error);

        res.status(400).json({
            success: false,
            message:
                error.message
        });
    }
}


export async function getStockSummary(
    req,
    res
) {
    try {
        const summary =
            await getStockSummaryService();

        res.json({
            success: true,
            data: summary
        });
    } catch (error) {
        console.error(error);

        res.status(400).json({
            success: false,
            message:
                error.message
        });
    }
}


export async function createStockPickingPlan(
    req,
    res
) {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message:
                    "Excel file is required."
            });
        }

        const workbook =
            XLSX.read(
                req.file.buffer,
                {
                    type: "buffer"
                }
            );

        if (
            !workbook.SheetNames.length
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Excel file does not contain a worksheet."
            });
        }

        const worksheet =
            workbook.Sheets[
                workbook.SheetNames[0]
            ];

        const rawRows =
            XLSX.utils.sheet_to_json(
                worksheet,
                {
                    defval: null,
                    raw: true
                }
            );

        if (
            rawRows.length === 0
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Excel file does not contain any data rows."
            });
        }

        const rows =
            rawRows.map(
                (
                    row,
                    index
                ) => {
                    const keys =
                        Object.keys(
                            row
                        );

                    const skuKey =
                        keys.find(
                            (key) =>
                                String(
                                    key
                                )
                                    .trim()
                                    .toLowerCase() ===
                                "sku"
                        );

                    const quantityKey =
                        keys.find(
                            (key) =>
                                String(
                                    key
                                )
                                    .trim()
                                    .toLowerCase() ===
                                "required qty"
                        );

                    if (
                        !skuKey ||
                        !quantityKey
                    ) {
                        throw new Error(
                            'Excel must contain exactly these required columns: "SKU" and "Required Qty".'
                        );
                    }

                    return {
                        sku:
                            row[
                                skuKey
                            ],

                        requiredQuantity:
                            row[
                                quantityKey
                            ],

                        rowNumber:
                            index + 2
                    };
                }
            );

        const result =
            await generateStockPickingPlan({
                rows
            });

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error(error);

        res.status(400).json({
            success: false,
            message:
                error.message
        });
    }
}


export async function getStockPickingPlanById(
    req,
    res
) {
    try {
        const {
            planId
        } = req.params;

        if (
            typeof planId !==
                "string" ||
            !planId.trim()
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Picking plan ID is required."
            });
        }

        const plan =
            getStockPickingPlan(
                planId
            );

        if (!plan) {
            return res.status(404).json({
                success: false,
                message:
                    "Picking plan not found or expired."
            });
        }

        res.json({
            success: true,
            data: plan
        });
    } catch (error) {
        console.error(error);

        res.status(400).json({
            success: false,
            message:
                error.message
        });
    }
}


export async function downloadStockPickingPlanReport(
    req,
    res
) {
    try {
        const {
            planId
        } = req.params;

        if (
            typeof planId !==
                "string" ||
            !planId.trim()
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Picking plan ID is required."
            });
        }

        const plan =
            getStockPickingPlan(
                planId
            );

        if (!plan) {
            return res.status(404).json({
                success: false,
                message:
                    "Picking plan not found or expired."
            });
        }

        const pickingRows = [];

        plan.items.forEach(
            (
                item
            ) => {
                item.locations.forEach(
                    (
                        location
                    ) => {
                        pickingRows.push({
                            SKU:
                                item.sku,

                            "Required Qty":
                                item.required,

                            Godown:
                                location.godownName,

                            Rack:
                                location.rackName,

                            "Available Qty":
                                location.available,

                            "Pick Qty":
                                location.pick
                        });
                    }
                );
            }
        );

        const summaryRows =
            plan.items.map(
                (
                    item
                ) => ({
                    SKU:
                        item.sku,

                    "Required Qty":
                        item.required,

                    "Total Available":
                        item.available,

                    "Total Pick":
                        item.picked,

                    Short:
                        item.short,

                    Excess:
                        item.excess,

                    Status:
                        item.status ===
                        "short"
                            ? "Short"
                            : item.status ===
                              "excess"
                                ? "Excess"
                                : "Enough"
                })
            );


        const workbook =
            XLSX.utils.book_new();


        const pickingWorksheet =
            XLSX.utils.json_to_sheet(
                pickingRows
            );


        const summaryWorksheet =
            XLSX.utils.json_to_sheet(
                summaryRows
            );


        pickingWorksheet[
            "!cols"
        ] = [
            {
                wch: 18
            },
            {
                wch: 15
            },
            {
                wch: 20
            },
            {
                wch: 18
            },
            {
                wch: 18
            },
            {
                wch: 14
            }
        ];


        summaryWorksheet[
            "!cols"
        ] = [
            {
                wch: 18
            },
            {
                wch: 15
            },
            {
                wch: 18
            },
            {
                wch: 15
            },
            {
                wch: 12
            },
            {
                wch: 12
            },
            {
                wch: 12
            }
        ];


        XLSX.utils.book_append_sheet(
            workbook,
            pickingWorksheet,
            "Picking Plan"
        );

        XLSX.utils.book_append_sheet(
            workbook,
            summaryWorksheet,
            "Summary"
        );


        /*
         * Apply status colors to the
         * Summary sheet.
         *
         * xlsx supports cell styles
         * when writing XLSX files.
         */
        summaryRows.forEach(
            (
                row,
                index
            ) => {
                const cellAddress =
                    XLSX.utils.encode_cell({
                        r:
                            index + 1,
                        c: 6
                    });

                const cell =
                    summaryWorksheet[
                        cellAddress
                    ];

                if (!cell) {
                    return;
                }

                if (
                    row.Status ===
                    "Excess"
                ) {
                    cell.s = {
                        fill: {
                            patternType:
                                "solid",
                            fgColor: {
                                rgb:
                                    "C6EFCE"
                            }
                        },
                        font: {
                            color: {
                                rgb:
                                    "006100"
                            },
                            bold:
                                true
                        }
                    };
                }

                if (
                    row.Status ===
                    "Enough"
                ) {
                    cell.s = {
                        fill: {
                            patternType:
                                "solid",
                            fgColor: {
                                rgb:
                                    "FFEB9C"
                            }
                        },
                        font: {
                            color: {
                                rgb:
                                    "9C6500"
                            },
                            bold:
                                true
                        }
                    };
                }

                if (
                    row.Status ===
                    "Short"
                ) {
                    cell.s = {
                        fill: {
                            patternType:
                                "solid",
                            fgColor: {
                                rgb:
                                    "FFC7CE"
                            }
                        },
                        font: {
                            color: {
                                rgb:
                                    "9C0006"
                            },
                            bold:
                                true
                        }
                    };
                }
            }
        );


        /*
         * Style the headers.
         */
        [
            pickingWorksheet,
            summaryWorksheet
        ].forEach(
            (
                worksheet
            ) => {
                const range =
                    XLSX.utils.decode_range(
                        worksheet[
                            "!ref"
                        ]
                    );

                for (
                    let column =
                        range.s.c;
                    column <=
                        range.e.c;
                    column++
                ) {
                    const cell =
                        worksheet[
                            XLSX.utils.encode_cell({
                                r: 0,
                                c: column
                            })
                        ];

                    if (!cell) {
                        continue;
                    }

                    cell.s = {
                        font: {
                            bold:
                                true
                        }
                    };
                }
            }
        );


        const buffer =
            XLSX.write(
                workbook,
                {
                    type:
                        "buffer",
                    bookType:
                        "xlsx"
                }
            );


        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );

        res.setHeader(
            "Content-Disposition",
            `attachment; filename="stock-picking-plan-${planId}.xlsx"`
        );

        res.send(
            buffer
        );
    } catch (error) {
        console.error(error);

        res.status(400).json({
            success: false,
            message:
                error.message
        });
    }
}