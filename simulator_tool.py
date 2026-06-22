def calculate_emi_and_cost(principal: float, roi: float, tenure_months: int, processing_fee_percent: float) -> dict:
    P = principal
    r = (roi / 12) / 100
    n = tenure_months
    
    emi = 0
    if r == 0:
        emi = P / n
    else:
        emi = P * r * ((1 + r) ** n) / (((1 + r) ** n) - 1)
        
    processing_fee = P * (processing_fee_percent / 100)
    total_interest = (emi * n) - P
    
    # GST applies to processing fee AND interest in Credit Card EMIs
    gst_on_fee = processing_fee * 0.18
    gst_on_interest = total_interest * 0.18
    total_gst = gst_on_fee + gst_on_interest
    
    total_extra = processing_fee + total_interest + total_gst
    
    return {
        "monthly_emi": round(emi, 2),
        "total_interest": round(total_interest, 2),
        "processing_fee": round(processing_fee, 2),
        "total_gst": round(total_gst, 2),
        "total_extra_payable": round(total_extra, 2),
        "total_payment": round(P + total_extra, 2)
    }
