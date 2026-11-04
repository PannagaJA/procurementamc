import { useEffect, useState } from "react";
import LibraryLayout from "@/components/library/LibraryLayout";
import { Button } from "@/components/ui/button";
import libraryApi from "@/lib/libraryApi";
import { useToast } from "@/hooks/use-toast";
import { PaginationControls } from "@/components/PaginationControls";
import { usePagedList } from "@/hooks/use-paged-list";

const ReturnBook = () => {
  const { toast } = useToast();
  const [issues, setIssues] = useState<any[]>([]);
  const [books, setBooks] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);

  const load = async () => {
    const [iRes, bRes, mRes] = await Promise.all([
      libraryApi.getIssues(),
      libraryApi.getBooks(),
      libraryApi.getMembers(),
    ]);
    const i = iRes.data || [];
    const b = bRes.data || [];
    setIssues(i);
    setBooks(b);
    setMembers(mRes || []);
  };

  const membersMap = Object.fromEntries(members.map((m: any) => [m.id, m.name]));
  const booksMap = Object.fromEntries(books.map((b: any) => [b.id, b.title]));

  useEffect(() => {
    load();
  }, []);

  const markReturned = async (id: string) => {
    try {
      const ok = await libraryApi.returnBook(id);
      if (!ok) {
        toast({
          title: "Failed",
          description: "Return processing failed.",
          variant: "destructive",
        });
        return;
      }
      await load();
      toast({ title: "Success", description: "Marked as returned successfully." });
    } catch (err: any) {
      console.error("Return failed", err);
      toast({
        title: "Error",
        description: err?.message || "Failed to mark returned",
        variant: "destructive",
      });
    }
  };

  const issuesPage = usePagedList(issues);

  return (
    <LibraryLayout>
      <h2 className="text-2xl font-bold mb-4">Return Book</h2>
      <div className="overflow-x-auto rounded-xl border border-border/60 bg-card p-2">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>Member</th>
              <th>Book</th>
              <th>Issue Date</th>
              <th>Due Date</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {issuesPage.pageItems.map((i) => (
              <tr key={i.id} className="border-t border-border">
                <td>{membersMap[i.memberId] || i.memberId}</td>
                <td>{booksMap[i.bookId] || i.bookId}</td>
                <td>{i.issueDate}</td>
                <td>{i.dueDate}</td>
                <td>
                  <Button onClick={() => markReturned(i.id)}>Return</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <PaginationControls {...issuesPage.controls} />
      </div>
    </LibraryLayout>
  );
};

export default ReturnBook;
