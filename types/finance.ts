export interface Budget {
  id: string;
  user_id: string;
  total_budget: number;
  budget_items: BudgetItem[];
  created_at: string;
  updated_at?: string;
}

export interface BudgetItem {
  id: string;
  budget_id: string;
  category: string;
  amount: number;
  created_at: string;
}

export interface Expense {
  id: string;
  user_id: string;
  category: string;
  amount: number;
  description?: string;
  expense_date: string;
  created_at: string;
}

export interface FinanceStats {
  totalBudget: number;
  totalAllocated: number;
  totalSpent: number;
  remaining: number;
  byCategory: Record<string, { allocated: number; spent: number }>;
}