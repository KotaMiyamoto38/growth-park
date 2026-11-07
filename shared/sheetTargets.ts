export interface SheetTarget {
  supporterName: string;
  spreadsheetId: string;
  sheetName: string;
  sheetId: number;
  startRow: number;
  skipPosition: boolean;
}

export const SHEET_TARGETS: readonly SheetTarget[] = [
  {
    supporterName: "株式会社Think UP",
    spreadsheetId: "1S7b3VpcujbNtQEzWcj9u5Fxnu3bvWuSJqPuhrDNBZnw",
    sheetName: "シート1", sheetId: 0, startRow: 14, skipPosition: true,
  },
  {
    supporterName: "Acroforce株式会社",
    spreadsheetId: "1fNfdNsBikcxXiFKa88Fef6B1CgPyRN3I56kJHEP2Ros",
    sheetName: "シート1", sheetId: 0, startRow: 4, skipPosition: false,
  },
];

function normalizedCompanyName(value: string): string {
  return value.normalize("NFKC").replace(/\s/g, "").toLowerCase();
}

export function getSheetTarget(companyName: string): SheetTarget | undefined {
  const name = normalizedCompanyName(companyName);
  return SHEET_TARGETS.find(target => normalizedCompanyName(target.supporterName) === name);
}
