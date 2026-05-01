import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import IDCard from "@/components/IDCard";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

function StatCard({ label, value, sub }) {
  return (
    <div className="border border-[#DCD9CF] p-6 bg-[#FBFAF6]">
      <div className="text-[10px] uppercase tracking-[0.24em] text-[#4A4A4A] mb-2">{label}</div>
      <div className="font-serif text-4xl tracking-tight">{value}</div>
      {sub && <div className="text-xs text-[#4A4A4A] mt-1">{sub}</div>}
    </div>
  );
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const [payments, setPayments] = useState([]);
  const [schedule, setSchedule] = useState([]);

  useEffect(() => {
    api.get("/payments").then((r) => setPayments(r.data)).catch(() => {});
    api.get("/cms/pages/schedule").then((r) => setSchedule(r.data?.content?.classes || [])).catch(() => {});
  }, []);

  const due = payments.filter((p) => p.status !== "paid");
  const totalDue = due.reduce((a, b) => a + b.amount, 0);
  const paidTotal = payments.filter((p) => p.status === "paid").reduce((a, b) => a + b.amount, 0);

  return (
    <DashboardLayout title="Student Portal" subtitle={`Welcome, ${user?.name?.split(" ")[0] || "student"}.`}>
      <div className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Balance Due" value={`$${totalDue.toFixed(2)}`} sub={`${due.length} open`} />
            <StatCard label="Paid to date" value={`$${paidTotal.toFixed(2)}`} />
            <StatCard label="Rank" value={user?.belt_rank || "—"} />
          </div>

          <section className="border border-[#DCD9CF] bg-[#FBFAF6]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#DCD9CF]">
              <h2 className="font-serif text-2xl">Payments</h2>
              <span className="text-[10px] uppercase tracking-[0.24em] text-[#4A4A4A]">Account Ledger</span>
            </div>
            <div className="divide-y divide-[#DCD9CF]">
              {payments.length === 0 && (
                <div className="px-6 py-8 text-sm text-[#4A4A4A]">No payments recorded.</div>
              )}
              {payments.map((p) => (
                <div key={p.id} className="px-6 py-4 grid grid-cols-[1fr_auto_auto] gap-6 items-center" data-testid={`payment-row-${p.id}`}>
                  <div>
                    <div className="font-medium text-sm">{p.description}</div>
                    <div className="text-xs text-[#4A4A4A] mt-0.5">
                      {p.due_date ? `Due ${new Date(p.due_date).toLocaleDateString()}` : "No due date"}
                      {p.paid_date && ` · Paid ${new Date(p.paid_date).toLocaleDateString()}`}
                    </div>
                  </div>
                  <div className="font-mono-accent tracking-widest text-sm">${p.amount.toFixed(2)}</div>
                  <span className={`text-[10px] uppercase tracking-[0.2em] px-3 py-1 border ${
                    p.status === "paid" ? "border-[#2E4E3F] text-[#2E4E3F]" :
                    p.status === "overdue" ? "border-[#D7263D] text-[#D7263D]" :
                    "border-[#B87F17] text-[#B87F17]"
                  }`}>{p.status}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="border border-[#DCD9CF] bg-[#FBFAF6]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#DCD9CF]">
              <h2 className="font-serif text-2xl">Your Classes</h2>
              <span className="text-[10px] uppercase tracking-[0.24em] text-[#4A4A4A]">Weekly Schedule</span>
            </div>
            <div className="divide-y divide-[#DCD9CF]">
              {schedule.map((s, i) => (
                <div key={i} className="px-6 py-3 flex items-center justify-between">
                  <div className="text-sm"><span className="font-medium">{s.day}</span> · {s.class}</div>
                  <div className="font-mono-accent text-xs text-[#4A4A4A]">{s.time}</div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="lg:col-span-5">
          <div className="sticky top-28">
            <IDCard user={user} />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
