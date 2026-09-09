import { useEffect, useState } from 'react';
import LibraryLayout from '@/components/library/LibraryLayout';
import { Button } from '@/components/ui/button';
import libraryApi from '@/lib/libraryApi';

const IssueBook = () => {
  const [members, setMembers] = useState<any[]>([]);
  const [books, setBooks] = useState<any[]>([]);
  const [memberId, setMemberId] = useState('');
  const [bookId, setBookId] = useState('');
  const [dueDate, setDueDate] = useState('');

  const load = async () => {
    const [mRes, bRes] = await Promise.all([libraryApi.getMembers(), libraryApi.getBooks()]);
    const m = mRes.data || [];
    const b = bRes.data || [];
    setMembers(m);
    setBooks(b);
  };

  useEffect(() => { load(); }, []);

  const issue = async () => {
    if (!memberId || !bookId) return alert('Select member and book');
    const book = books.find(b => b.id === bookId);
    if (!book || (book.available || 0) <= 0) return alert('No copies available');

    try {
      const payload = {
        bookId,
        memberId,
        issueDate: new Date().toISOString().slice(0,10),
        dueDate,
        availableAfter: (book.available || 0) - 1
      };
      await libraryApi.issueBook(payload);
      await load();
      alert('Book issued');
    } catch (err:any) {
      console.error('Issue failed', err);
      alert(err?.message || 'Failed to issue book');
    }
  };

  return (
    <LibraryLayout>
      <h2 className="text-2xl font-bold mb-4">Issue Book</h2>
      <div className="space-y-3 max-w-md">
        <select value={memberId} onChange={e => setMemberId(e.target.value)} className="w-full p-2 border rounded">
          <option value="">Select member</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.name} ({m.email})</option>)}
        </select>
        <select value={bookId} onChange={e => setBookId(e.target.value)} className="w-full p-2 border rounded">
          <option value="">Select book</option>
          {books.map(b => <option key={b.id} value={b.id}>{b.title} — {b.available} available</option>)}
        </select>
        <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="w-full p-2 border rounded" />
        <Button onClick={issue}>Issue</Button>
      </div>
    </LibraryLayout>
  );
};

export default IssueBook;
