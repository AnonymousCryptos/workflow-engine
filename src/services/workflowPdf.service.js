import PDFDocument from "pdfkit";
import {
    getWorkflowRunForPdf,
    getSkuDetailsForPdf
} from "../database/workflowRun.repository.js";

async function fetchImage(imageUrl) {
    if (!imageUrl) {
        return null;
    }

    try {
        const response = await fetch(imageUrl);

        if (!response.ok) {
            return null;
        }

        const contentType =
            response.headers.get("content-type") || "";

        if (!contentType.startsWith("image/")) {
            return null;
        }

        const arrayBuffer =
            await response.arrayBuffer();

        return Buffer.from(arrayBuffer);
    } catch (error) {
        console.error(
            `Failed to fetch image: ${imageUrl}`,
            error
        );

        return null;
    }
}

function formatDate(date) {
    if (!date) {
        return "";
    }

    return new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
    }).format(new Date(date));
}

export async function generateWorkflowPdf(workflowRunId) {
    const run =
        await getWorkflowRunForPdf(workflowRunId);

    if (!run) {
        throw new Error("Workflow run not found");
    }

    let stageData = run.stageData;

    if (typeof stageData === "string") {
        stageData = JSON.parse(stageData);
    }

    const skuItems = Array.isArray(
        stageData?.sku_items
    )
        ? stageData.sku_items
        : [];

    if (skuItems.length === 0) {
        throw new Error(
            "No SKU items found for this workflow run"
        );
    }

    const skuNames = [
        ...new Set(
            skuItems
                .map((item) => item.sku)
                .filter(Boolean)
        )
    ];

    const skuDetails =
        await getSkuDetailsForPdf(skuNames);

    const skuMap = new Map(
        skuDetails.map((sku) => [
            sku.sku_name,
            sku
        ])
    );

    const document = new PDFDocument({
        size: "A4",
        margin: 45
    });

    const chunks = [];

    document.on("data", (chunk) => {
        chunks.push(chunk);
    });

    const pdfBufferPromise = new Promise(
        (resolve, reject) => {
            document.on("end", () => {
                resolve(
                    Buffer.concat(chunks)
                );
            });

            document.on("error", reject);
        }
    );

    /*
     * ------------------------------------------------
     * HEADER
     * ------------------------------------------------
     */

    document
        .fillColor("#101828")
        .font("Helvetica-Bold")
        .fontSize(19)
        .text(
            "PROGRAM CREATION"
        );

    document
        .moveDown(0.3)
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#667085")
        .text(
            "Garment Workflow"
        );

    document.moveDown(1);

    /*
     * ------------------------------------------------
     * PROGRAM INFORMATION
     * ------------------------------------------------
     */

    const infoStartY = document.y;

    const leftX = document.page.margins.left;
    const rightX =
        document.page.width -
        document.page.margins.right;

    const infoWidth =
        rightX - leftX;

    document
        .roundedRect(
            leftX,
            infoStartY,
            infoWidth,
            88,
            6
        )
        .fillColor("#f8fafc")
        .fill();

    document
        .roundedRect(
            leftX,
            infoStartY,
            infoWidth,
            88,
            6
        )
        .lineWidth(0.7)
        .strokeColor("#e4e7ec")
        .stroke();

    const labelX = leftX + 14;
    const valueX = leftX + 115;

    function infoRow(
        label,
        value,
        y
    ) {
        document
            .font("Helvetica-Bold")
            .fontSize(8)
            .fillColor("#667085")
            .text(
                label,
                labelX,
                y
            );

        document
            .font("Helvetica")
            .fontSize(9)
            .fillColor("#101828")
            .text(
                value || "-",
                valueX,
                y
            );
    }

    infoRow(
        "Reference Name",
        stageData.reference_name,
        infoStartY + 14
    );

    infoRow(
        "Party Name",
        stageData.party_name,
        infoStartY + 34
    );

    infoRow(
        "Reference ID",
        run.referenceId,
        infoStartY + 54
    );

    infoRow(
        "Created On",
        formatDate(run.createdAt),
        infoStartY + 74
    );

    document.y =
        infoStartY + 110;

    /*
     * ------------------------------------------------
     * TABLE
     * ------------------------------------------------
     */

    const tableX =
        document.page.margins.left;

    const tableWidth =
        document.page.width -
        document.page.margins.left -
        document.page.margins.right;

    const skuWidth = 220;
    const quantityWidth = 80;

    const imageWidth =
        tableWidth -
        skuWidth -
        quantityWidth;

    const headerHeight = 32;
    const rowHeight = 88;

    let y = document.y;

    function drawCell(
        x,
        y,
        width,
        height
    ) {
        document
            .rect(
                x,
                y,
                width,
                height
            )
            .lineWidth(0.6)
            .strokeColor("#d0d5dd")
            .stroke();
    }

    /*
     * TABLE HEADER
     */

    document
        .rect(
            tableX,
            y,
            tableWidth,
            headerHeight
        )
        .fillColor("#344054")
        .fill();

    document
        .fillColor("#ffffff")
        .font("Helvetica-Bold")
        .fontSize(9);

    document.text(
        "SKU",
        tableX + 10,
        y + 10
    );

    document.text(
        "QUANTITY",
        tableX +
            skuWidth +
            10,
        y + 10
    );

    document.text(
        "IMAGE",
        tableX +
            skuWidth +
            quantityWidth +
            10,
        y + 10
    );

    y += headerHeight;

    /*
     * TABLE ROWS
     */

    for (
        let index = 0;
        index < skuItems.length;
        index++
    ) {
        const item = skuItems[index];

        if (
            y + rowHeight >
            document.page.height -
                document.page.margins.bottom
        ) {
            document.addPage();

            y = document.page.margins.top;

            document
                .rect(
                    tableX,
                    y,
                    tableWidth,
                    headerHeight
                )
                .fillColor("#344054")
                .fill();

            document
                .fillColor("#ffffff")
                .font("Helvetica-Bold")
                .fontSize(9);

            document.text(
                "SKU",
                tableX + 10,
                y + 10
            );

            document.text(
                "QUANTITY",
                tableX +
                    skuWidth +
                    10,
                y + 10
            );

            document.text(
                "IMAGE",
                tableX +
                    skuWidth +
                    quantityWidth +
                    10,
                y + 10
            );

            y += headerHeight;
        }

        const rowBackground =
            index % 2 === 0
                ? "#ffffff"
                : "#f9fafb";

        document
            .rect(
                tableX,
                y,
                tableWidth,
                rowHeight
            )
            .fillColor(rowBackground)
            .fill();

        drawCell(
            tableX,
            y,
            skuWidth,
            rowHeight
        );

        drawCell(
            tableX + skuWidth,
            y,
            quantityWidth,
            rowHeight
        );

        drawCell(
            tableX +
                skuWidth +
                quantityWidth,
            y,
            imageWidth,
            rowHeight
        );

        document
            .font("Helvetica")
            .fontSize(9)
            .fillColor("#101828")
            .text(
                String(item.sku ?? ""),
                tableX + 10,
                y + 14,
                {
                    width:
                        skuWidth - 20
                }
            );

        document
            .font("Helvetica")
            .fontSize(9)
            .fillColor("#101828")
            .text(
                String(
                    item.quantity ?? ""
                ),
                tableX +
                    skuWidth +
                    10,
                y + 14,
                {
                    width:
                        quantityWidth - 20
                }
            );

        const skuDetail =
            skuMap.get(item.sku);

        if (skuDetail?.image_url) {
            const imageBuffer =
                await fetchImage(
                    skuDetail.image_url
                );

            if (imageBuffer) {
                const imageX =
                    tableX +
                    skuWidth +
                    quantityWidth +
                    10;

                const imageY =
                    y + 8;

                document.image(
                    imageBuffer,
                    imageX,
                    imageY,
                    {
                        fit: [
                            imageWidth - 20,
                            rowHeight - 16
                        ],
                        link:
                            skuDetail.image_url
                    }
                );
            } else {
                document
                    .fontSize(8)
                    .fillColor("#98a2b3")
                    .text(
                        "Image unavailable",
                        tableX +
                            skuWidth +
                            quantityWidth +
                            10,
                        y + 14
                    );
            }
        } else {
            document
                .fontSize(8)
                .fillColor("#98a2b3")
                .text(
                    "Image unavailable",
                    tableX +
                        skuWidth +
                        quantityWidth +
                        10,
                    y + 14
                );
        }

        y += rowHeight;
    }

    /*
     * ------------------------------------------------
     * FOOTER
     * ------------------------------------------------
     */

    const footerY =
        document.page.height -
        30;

    document
        .font("Helvetica")
        .fontSize(7)
        .fillColor("#98a2b3")
        .text(
            `Reference ID: ${run.referenceId}`,
            document.page.margins.left,
            footerY,
            {
                width:
                    tableWidth,
                align: "center"
            }
        );

    document.end();

    return await pdfBufferPromise;
}