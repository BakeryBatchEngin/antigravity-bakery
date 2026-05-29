import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import ExcelJS from 'exceljs';
import { GET as getProduction } from '../route';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month'); // e.g., '2026-03'
    if (!month) return NextResponse.json({ error: 'month parameter is required' }, { status: 400 });

    const cookieStore = await cookies();
    const storeCookie = cookieStore.get('active_store_id');
    const storeId = storeCookie ? Number(storeCookie.value) : null;
    if (!storeId) return NextResponse.json({ error: '店舗が選択されていません' }, { status: 400 });

    // Call the GET function to get the records
    const dummyUrl = new URL(request.url);
    dummyUrl.pathname = '/api/reports/production';
    const mockReq = new Request(dummyUrl.toString());
    const resCtx = await getProduction(mockReq);
    const resData = await resCtx.json();

    if (!resData.records || resData.records.length === 0) {
      return NextResponse.json({ error: '出力するデータがありません' }, { status: 404 });
    }

    const records = resData.records;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Antigravity Bakery System';
    const sheet = workbook.addWorksheet(`${month} 生産実績`);

    const [yearStr, monthStr] = month.split('-');
    const year = parseInt(yearStr, 10);
    const m = parseInt(monthStr, 10);
    const lastDay = new Date(year, m, 0).getDate();

    const days: string[] = [];
    for (let i = 1; i <= lastDay; i++) {
      days.push(`${year}-${monthStr}-${i.toString().padStart(2, '0')}`);
    }

    sheet.getColumn(1).width = 15;
    sheet.getColumn(2).width = 30;
    for (let i = 0; i < days.length; i++) {
       sheet.getColumn(3 + i).width = 8;
    }

    // Header Row
    const headerVals = [`${m}月`, '', ...days.map(d => `${parseInt(d.split('-')[2], 10)}日`)];
    const row1 = sheet.addRow(headerVals);
    sheet.mergeCells('A1:B1');
    row1.font = { bold: true, size: 14 };
    row1.alignment = { horizontal: 'center' };
    for (let i = 1; i <= 2 + days.length; i++) {
        const cell = row1.getCell(i);
        cell.border = { top:{style:'thin', color: {argb:'FFB2B2B2'}}, bottom:{style:'thin', color: {argb:'FFB2B2B2'}}, left:{style:'thin', color: {argb:'FFB2B2B2'}}, right:{style:'thin', color: {argb:'FFB2B2B2'}} };
    }

    // Data Rows
    records.forEach((rec: any, idx: number) => {
      const rowData = [rec.productCode, rec.productName];
      days.forEach(d => {
        rowData.push(rec.dailyCounts[d] || 0);
      });
      const row = sheet.addRow(rowData);
      
      const isOdd = idx % 2 === 0;
      const bgColor = isOdd ? 'FF92D050' : 'FFC6E0B4'; // 緑の濃淡

      for (let c = 1; c <= 2 + days.length; c++) {
         const cell = row.getCell(c);
         cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
         cell.border = { top:{style:'thin', color: {argb:'FF000000'}}, bottom:{style:'thin', color: {argb:'FF000000'}}, left:{style:'thin', color: {argb:'FF000000'}}, right:{style:'thin', color: {argb:'FF000000'}} };
         if (c > 2) {
             cell.alignment = { horizontal: 'right' };
             // Use 0 formatting
             cell.numFmt = '#,##0';
         }
      }
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="production_record_${month}.xlsx"`,
      },
    });

  } catch (error) {
    console.error('Error exporting production Excel:', error);
    return NextResponse.json({ error: 'Excel出力に失敗しました' }, { status: 500 });
  }
}
