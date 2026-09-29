"use client";
import { useEffect, useState } from "react";
import { addDays } from "@/lib/dates";
import { SPENDING_CATEGORIES } from "@/lib/metrics";
import { useAddTransaction } from "@/client/mutations";
import { useToday } from "@/client/today";
import { Sheet } from "../ui/sheet";
import { Button } from "../ui/button";
import { Chip, Field, Input, Segmented } from "../ui/field";

export function TransactionSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const today = useToday();
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("restaurants");
  const [merchant, setMerchant] = useState("");
  const [day, setDay] = useState<"today" | "yesterday">("today");
  const add = useAddTransaction();
  useEffect(() => {
    if (open) {
      setAmount("");
      setMerchant("");
      setDay("today");
    }
  }, [open]);
  const v = Number(amount.replace(",", "."));
  const submit = async () => {
    if (!Number.isFinite(v) || v <= 0) return;
    await add.mutateAsync({ date: day === "today" ? today : addDays(today, -1), amount: v, category, merchant: merchant.trim() || null });
    onOpenChange(false);
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="הוצאה" footer={<Button block size="lg" onClick={submit} loading={add.isPending} disabled={!(v > 0)}>שמירה</Button>}>
      <div className="space-y-5 pt-1">
        <Field label="סכום (₪)">
          <Input autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className="num text-center text-3xl font-semibold" />
        </Field>
        <div>
          <div className="mb-2 text-sm font-medium text-ink-2">קטגוריה</div>
          <div className="flex flex-wrap gap-2">
            {SPENDING_CATEGORIES.map((c) => (
              <Chip key={c.key} active={category === c.key} onClick={() => setCategory(c.key)}>
                {c.label}
              </Chip>
            ))}
          </div>
        </div>
        <Field label="איפה? (לא חובה)">
          <Input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="למשל: ארומה" />
        </Field>
        <Segmented value={day} onChange={setDay} className="w-full" options={[{ value: "today", label: "היום" }, { value: "yesterday", label: "אתמול" }]} />
      </div>
    </Sheet>
  );
}
