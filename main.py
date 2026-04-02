from fastapi import FastAPI, Query, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import pymongo
import pandas as pd
import numpy as np
import io
import re
from typing import List
from datetime import datetime

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

client = pymongo.MongoClient("mongodb://localhost:27017/")
db = client["DHL_OrderBook"]

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    match = re.search(r"(\d{8})", file.filename)
    if not match: raise HTTPException(status_code=400, detail="Filename missing date")
    report_date = match.group(1)
    contents = await file.read()
    df_o = pd.read_excel(io.BytesIO(contents), sheet_name='Orders')
    df_d = pd.read_excel(io.BytesIO(contents), sheet_name='Detailed')
    for df in [df_o, df_d]:
        df['ReportDate'] = report_date
        df.replace({np.nan: None, pd.NA: None, pd.NaT: None}, inplace=True)
    db.orders.delete_many({"ReportDate": report_date})
    db.order_details.delete_many({"ReportDate": report_date})
    db.orders.insert_many(df_o.to_dict('records'))
    db.order_details.insert_many(df_d.to_dict('records'))
    return {"message": "Success"}

@app.get("/api/report-dates")
def get_report_dates():
    return sorted(db.orders.distinct("ReportDate"), reverse=True)

@app.get("/api/products")
def get_products(report_date: str):
    # Only return unique Order Descriptions where the projection for that week is > 0
    query = {
        "ReportDate": report_date, 
        "Full This Year Projection": {"$gt": 0}  # $gt means "Greater Than"
    }
    
    products = db.orders.distinct("Order Description", query)
    
    # Return sorted list, excluding any nulls
    return sorted([p for p in products if p])

@app.get("/api/summary")
def get_summary(report_date: str, product_names: List[str] = Query(None)):
    query = {"ReportDate": report_date}
    if product_names: query["Order Description"] = {"$in": product_names}
    
    # 1. Fetch Current
    orders = list(db.orders.find(query, {"_id": 0}))
    
    # 2. WoW Logic: Find previous report date
    all_dates = sorted(db.orders.distinct("ReportDate"))
    prev_date = all_dates[all_dates.index(report_date)-1] if report_date in all_dates and all_dates.index(report_date) > 0 else None
    
    prev_totals = {}
    if prev_date:
        prev_data = db.orders.find({"ReportDate": prev_date}, {"Order Description": 1, "Full This Year Projection": 1})
        prev_totals = {p["Order Description"]: p["Full This Year Projection"] for p in prev_data}

    # 3. Process Trends & Variance
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "July", "Aug", "Sept", "Oct", "Nov", "Dec"]
    individual_trends = []
    total_wow_delta = 0
    
    for o in orders:
        desc = o.get("Order Description")
        # Calc Variance
        old_val = prev_totals.get(desc, o.get("Full This Year Projection", 0))
        o["wow_delta"] = o.get("Full This Year Projection", 0) - old_val
        total_wow_delta += o["wow_delta"]

        # Details for Tooltip
        details = list(db.order_details.find({"ReportDate": report_date, "Order Description": desc}, {"_id": 0}))
        trend_data = []
        for m in months:
            breakdown = [{"material": d.get("Material Description"), "cost": d.get(m, 0) or 0} for d in details]
            trend_data.append({"month": m, "cost": o.get(m, 0) or 0, "breakdown": breakdown})
        individual_trends.append({"name": desc, "data": trend_data})

    # 4. Service Tower Aggregation
    tower_pipeline = [
        {"$match": query},
        {"$group": {"_id": "$Service Tower/LOB", "value": {"$sum": "$Full This Year Projection"}}}
    ]
    towers = [{"name": t["_id"], "value": t["value"]} for t in db.order_details.aggregate(tower_pipeline)]

    # 5. Ghost Item Audit (Inactive status but cost > 0)
    ghost_query = {**query, "Item Status": {"$ne": "Active"}}
    ghosts = list(db.order_details.find(ghost_query))
    ghost_cost = sum(sum(g.get(m, 0) or 0 for m in months) for g in ghosts)

    return {
        "orders": orders,
        "individualTrends": individual_trends,
        "cumulativeTrend": [{"month": m, "cost": sum((o.get(m, 0) or 0) for o in orders)} for m in months],
        "towerStats": sorted(towers, key=lambda x: x['value'], reverse=True),
        "wowTotalDelta": total_wow_delta,
        "audit": {"ghostCount": len(ghosts), "ghostCost": ghost_cost}
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8009)