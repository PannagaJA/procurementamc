import { useEffect, useState } from 'react';
import LibraryLayout from '@/components/library/LibraryLayout';
import { Button } from '@/components/ui/button';
import libraryApi from '@/lib/libraryApi';

const ReturnBook = () => {
  const [issues, setIssues] = useState<any[]>([]);
  const [books, setBooks] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);

  const load = async () => {
    const [iRes, bRes, mRes] = await Promise.all([libraryApi.getIssues(), libraryApi.getBooks(), libraryApi.getMembers()]);
    const i = iRes.data || [];
    const b = bRes.data || [];
    setIssues(i);
    setBooks(b);
    setMembers(mRes || []);
  };

  const membersMap = Object.fromEntries(members.map((m: any) => [m.id, m.name]));
  const booksMap = Object.fromEntries(books.map((b: any) => [b.id, b.title]));

  useEffect(() => { load(); }, []);

  const markReturned = async (id: string) => {
    try {
      const ok = await libraryApi.returnBook(id);
      if (!ok) return alert('Return failed');
      await load();
      alert('Marked returned');
    } catch (err:any) {
      console.error('Return failed', err);
      alert(err?.message || 'Failed to mark returned');
    }
  };

  return (
    <LibraryLayout>
      <h2 className="text-2xl font-bold mb-4">Return Book</h2>
      <div className="overflow-x-auto bg-card rounded shadow p-2">
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
            {issues.map(i => (
              <tr key={i.id} className="border-t border-border">
                <td>{membersMap[i.memberId] || i.memberId}</td>
                <td>{booksMap[i.bookId] || i.bookId}</td>
                <td>{i.issueDate}</td>
                <td>{i.dueDate}</td>
                <td><Button onClick={() => markReturned(i.id)}>Return</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </LibraryLayout>
  );
};

export default ReturnBook;
