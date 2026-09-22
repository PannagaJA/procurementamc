import LibraryLayout from "@/components/library/LibraryLayout";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import libraryApi from "@/lib/libraryApi";
import { useParams } from "@tanstack/react-router";

const Reports = ({ type }: { type?: "issued" | "overdue" }) => {
  const params = useParams({ strict: false }) as { type?: string };
  const reportType = type || (params.type as "issued" | "overdue" | undefined);
  const [issues, setIssues] = useState<any[]>([]);
  const [booksMap, setBooksMap] = useState<Record<string, string>>({});
  const [membersMap, setMembersMap] = useState<Record<string, string>>({});

  const load = async () => {
    const [iRes, bRes, mRes] = await Promise.all([
      libraryApi.getIssues(),
      libraryApi.getBooks(),
      libraryApi.getMembers(),
    ]);
    const i = iRes.data || [];
    const b = bRes.data || [];
    const m = mRes.data || [];
    setIssues(i);
    setBooksMap(
      b.reduce(
        (acc: any, cur: any) => {
          acc[cur.id] = cur.title;
          return acc;
        },
        {} as Record<string, string>,
      ),
    );
    setMembersMap(
      m.reduce(
        (acc: any, cur: any) => {
          acc[cur.id] = cur.name;
          return acc;
        },
        {} as Record<string, string>,
      ),
    );
  };

  useEffect(() => {
    load();
  }, []);

  const exportCsv = () => {
    const headers = ["id", "book", "member", "issueDate", "dueDate"];
    const rows = issues.map((i) =>
      [
        i.id,
        booksMap[i.bookId] || i.bookId,
        membersMap[i.memberId] || i.memberId,
        i.issueDate,
        i.dueDate,
      ].join(","),
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-${type || "issued"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <LibraryLayout>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">
          {reportType === "overdue" ? "Overdue Books" : "Issued Books"}
        </h2>
        <Button onClick={exportCsv}>Export CSV</Button>
      </div>
      <div className="overflow-x-auto bg-card rounded shadow p-2">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>Book</th>
              <th>Member</th>
              <th>Issue Date</th>
              <th>Due Date</th>
            </tr>
          </thead>
          <tbody>
            {issues.map((i) => (
              <tr key={i.id} className="border-t border-border">
                <td>{booksMap[i.bookId] || i.bookId}</td>
                <td>{membersMap[i.memberId] || i.memberId}</td>
                <td>{i.issueDate}</td>
                <td>{i.dueDate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </LibraryLayout>
  );
};

export default Reports;
