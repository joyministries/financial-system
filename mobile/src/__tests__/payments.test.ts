describe('Payment amount validation', () => {
  const isValidAmount = (amount: string): boolean => {
    const num = parseFloat(amount);
    return !isNaN(num) && num >= 0.01;
  };

  it('rejects empty amount', () => {
    expect(isValidAmount('')).toBe(false);
  });

  it('rejects zero', () => {
    expect(isValidAmount('0')).toBe(false);
  });

  it('rejects negative', () => {
    expect(isValidAmount('-5')).toBe(false);
  });

  it('rejects non-numeric', () => {
    expect(isValidAmount('abc')).toBe(false);
  });

  it('accepts minimum amount', () => {
    expect(isValidAmount('0.01')).toBe(true);
  });

  it('accepts normal amount', () => {
    expect(isValidAmount('1500.00')).toBe(true);
  });

  it('accepts large amount', () => {
    expect(isValidAmount('120000.00')).toBe(true);
  });
});

describe('Money formatting', () => {
  // en-ZA locale uses non-breaking space as thousands separator and comma as decimal
  const money = (n: number) =>
    `R ${Number(n || 0).toLocaleString('en-ZA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  it('formats zero', () => {
    expect(money(0)).toBe('R 0,00');
  });

  it('formats whole number', () => {
    const result = money(5000);
    // en-ZA uses NBSP (\u00A0) as thousands separator, comma as decimal
    expect(result).toContain('5');
    expect(result).toContain('000');
    expect(result).toContain(',00');
    expect(result).toMatch(/^R/);
  });

  it('formats decimal', () => {
    const result = money(1234.56);
    expect(result).toContain('1');
    expect(result).toContain('234');
    expect(result).toContain(',56');
  });

  it('handles NaN', () => {
    expect(money(NaN)).toBe('R 0,00');
  });

  it('handles undefined as zero', () => {
    expect(money(undefined as any)).toBe('R 0,00');
  });
});

describe('Status filter logic', () => {
  const payments = [
    { id: '1', status: 'verified', amount: 5000 },
    { id: '2', status: 'pending', amount: 2500 },
    { id: '3', status: 'verified', amount: 1500 },
    { id: '4', status: 'rejected', amount: 1000 },
  ];

  const filterByStatus = (items: typeof payments, status: string) => {
    if (status === 'all') return items;
    return items.filter((p) => p.status === status);
  };

  it('returns all when filter is all', () => {
    expect(filterByStatus(payments, 'all')).toHaveLength(4);
  });

  it('filters verified', () => {
    expect(filterByStatus(payments, 'verified')).toHaveLength(2);
  });

  it('filters pending', () => {
    expect(filterByStatus(payments, 'pending')).toHaveLength(1);
  });

  it('filters rejected', () => {
    expect(filterByStatus(payments, 'rejected')).toHaveLength(1);
  });

  it('returns empty for non-existent status', () => {
    expect(filterByStatus(payments, 'reversed')).toHaveLength(0);
  });
});

describe('Date filter logic', () => {
  const receipts = [
    { id: '1', created_at: new Date().toISOString(), amount: 5000 },
    { id: '2', created_at: '2025-01-15T10:00:00Z', amount: 2500 },
    { id: '3', created_at: '2024-06-10T10:00:00Z', amount: 1500 },
  ];

  const filterByDate = (items: typeof receipts, filter: string) => {
    if (filter === 'all') return items;
    const now = new Date();
    return items.filter((r) => {
      const d = new Date(r.created_at);
      if (filter === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      if (filter === 'year') return d.getFullYear() === now.getFullYear();
      return true;
    });
  };

  it('returns all for all time', () => {
    expect(filterByDate(receipts, 'all')).toHaveLength(3);
  });

  it('filters this month (current year)', () => {
    const thisMonth = filterByDate(receipts, 'month');
    expect(thisMonth.length).toBeGreaterThanOrEqual(1);
    expect(thisMonth.every((r) => {
      const d = new Date(r.created_at);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })).toBe(true);
  });
});

describe('Statement balance logic', () => {
  it('uses last closing_balance as total outstanding (not sum)', () => {
    const statements = [
      { month: 1, closing_balance: 1000 },
      { month: 2, closing_balance: 2000 },
      { month: 3, closing_balance: 1500 },
    ];
    const latest = statements[statements.length - 1];
    expect(Number(latest.closing_balance)).toBe(1500);
  });

  it('handles empty statements', () => {
    const statements: any[] = [];
    const latest = statements.length > 0 ? statements[statements.length - 1] : null;
    expect(latest).toBeNull();
  });
});
