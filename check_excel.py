import pandas as pd
import json

try:
    df = pd.read_excel(r"C:\Users\hiros\Downloads\products_master net.xlsx")
    print(df.head(10).to_json(orient='records', force_ascii=False))
except Exception as e:
    print("Error:", e)
