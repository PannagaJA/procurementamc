import { useEffect, useState } from "react";
import LibraryLayout from "@/components/library/LibraryLayout";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import libraryApi from "@/lib/libraryApi";

const IssueBook = () => {
  const [members, setMembers] = useState<any[]>([]);
  const [books, setBooks] = useState<any[]>([]);
  const [memberId, setMemberId] = useState("");
  const [bookId, setBookId] = useState("");
  const [dueDate, setDueDate] = useState("");

  const load = async () => {
    const [mRes, bRes] = await Promise.all([libraryApi.getMembers(), libraryApi.getBooks()]);
    const m = mRes.data || [];
    const b = bRes.data || [];
    setMembers(m);
    setBooks(b);
  };

  useEffect(() => {
    load();
  }, []);

  const issue = async () => {
    if (!memberId || !bookId) return alert("Select member and book");
    const book = books.find((b) => b.id === bookId);
    if (!book || (book.available || 0) <= 0) return alert("No copies available");

    try {
      const payload = {
        bookId,
        memberId,
        issueDate: new Date().toISOString().slice(0, 10),
        dueDate,
        availableAfter: (book.available || 0) - 1,
      };
      await libraryApi.issueBook(payload);
      await load();
      alert("Book issued");
    } catch (err: any) {
      console.error("Issue failed", err);
      alert(err?.message || "Failed to issue book");
    }
  };

  return (
    <LibraryLayout>
      <h2 className="text-2xl font-bold mb-4">Issue Book</h2>
      <div className="space-y-3 max-w-md">
        <Select value={memberId} onValueChange={setMemberId}>
          <SelectTrigger className="w-full h-10">
            <SelectValue placeholder="Select member" />
          </SelectTrigger>
          <SelectContent>
            {members.length === 0 ? (
              <div className="py-2 px-3 text-sm text-muted-foreground text-center">No members found</div>
            ) : (
              members.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name} ({m.email})
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <Select value={bookId} onValueChange={setBookId}>
          <SelectTrigger className="w-full h-10">
            <SelectValue placeholder="Select book" />
          </SelectTrigger>
          <SelectContent>
            {books.length === 0 ? (
              <div className="py-2 px-3 text-sm text-muted-foreground text-center">No books found</div>
            ) : (
              books.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.title} — {b.available} available
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <DatePicker
          value={dueDate}
          onChange={setDueDate}
          placeholder="Select due date"
          className="w-full"
        />
        <Button onClick={issue}>Issue</Button>
      </div>
    </LibraryLayout>
  );
};

export default IssueBook;
