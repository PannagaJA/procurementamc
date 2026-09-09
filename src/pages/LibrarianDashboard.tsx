import LibraryLayout from '@/components/library/LibraryLayout';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import libraryApi from '@/lib/libraryApi';

const LibrarianDashboard = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalBooks: 0, totalMembers: 0, issued: 0, overdue: 0 });
  const [recent, setRecent] = useState<any[]>([]);

  useEffect(() => {
    const init = async () => {
      try {
        const [booksRes, membersRes, issuesRes] = await Promise.all([libraryApi.getBooks(), libraryApi.getMembers(), libraryApi.getIssues()]);
        const books = booksRes.data || [];
        const members = membersRes.data || [];
        const issues = issuesRes.data || [];
        const overdue = (issues || []).filter((i:any) => new Date(i.dueDate) < new Date()).length;
        setStats({ totalBooks: books.length, totalMembers: members.length, issued: issues.length, overdue });
          const booksMap = books.reduce((acc:any,cur:any)=>{ acc[cur.id]=cur.title; return acc; }, {});
          const membersMap = members.reduce((acc:any,cur:any)=>{ acc[cur.id]=cur.name; return acc; }, {});
          setRecent(issues.slice(0,10).map((i:any)=>({ ...i, bookTitle: booksMap[i.bookId]||i.bookId, memberName: membersMap[i.memberId]||i.memberId })));
      } catch (err) {
        console.error("Error initializing librarian dashboard:", err);
        toast({ title: "Error", description: "Failed to load librarian data", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [toast]);

  return (
    <LibraryLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Library Management</h2>
          <p className="text-muted-foreground">Librarian dashboard for managing the library</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Total Books</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalBooks}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Total Members</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalMembers}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Issued Books</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.issued}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Overdue Books</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.overdue}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr><th>Action</th><th>Book</th><th>Member</th><th>Date</th></tr>
                </thead>
                <tbody>
                    {recent.map((i:any) => (
                      <tr key={i.id} className="border-t border-border">
                        <td>Issued</td>
                        <td>{i.bookTitle}</td>
                        <td>{i.memberName}</td>
                        <td>{i.issueDate}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </LibraryLayout>
  );
};

export default LibrarianDashboard;
