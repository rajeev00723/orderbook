import pandas as pd
import pymongo
import os
import glob
import numpy as np # Add this import

# Configuration
PATH = r"C:\DHL\orderbook\data"
MONGO_URI = "mongodb://localhost:27017/"
DB_NAME = "DHL_OrderBook"

def processing_express_file():
    # 1. Find the latest Express file
    files = glob.glob(os.path.join(PATH, "*EXPRESS*.xlsx"))
    if not files:
        print("No Express files found!")
        return
        
    latest_file = max(files, key=os.path.getctime)
    print(f"Processing: {latest_file}")
    
    # 2. Load Tabs
    df_orders = pd.read_excel(latest_file, sheet_name='Orders')
    df_detailed = pd.read_excel(latest_file, sheet_name='Detailed')

    # --- START OF FIX ---
    # Replace NaT (dates) and NaN (numbers/text) with None so MongoDB accepts them
    df_orders = df_orders.replace({pd.NaT: None, np.nan: None})
    df_detailed = df_detailed.replace({pd.NaT: None, np.nan: None})
    # --- END OF FIX ---

    # 3. Connect to Mongo
    client = pymongo.MongoClient(MONGO_URI)
    db = client[DB_NAME]

    # 4. Upsert data
    db.orders.delete_many({}) 
    if not df_orders.empty:
        db.orders.insert_many(df_orders.to_dict('records'))
    
    db.order_details.delete_many({})
    if not df_detailed.empty:
        db.order_details.insert_many(df_detailed.to_dict('records'))
    
    print(f"Successfully updated database.")

if __name__ == "__main__":
    processing_express_file()