import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import LibraryLayout from "@/components/library/LibraryLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import libraryApi from "@/lib/libraryApi";
import { z } from "zod";
import { PaginationControls } from "@/components/PaginationControls";
import { Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Book {
  id: string;
  title: string;
  author: string | null;
  category: string | null;
  isbn: string | null;
  quantity: number;
  available: number;
}

const bookSchema = z.object({
  title: z.string().min(1),
  author: z.string().min(1),
  category: z.string().min(1),
  isbn: z.string().min(1),
  quantity: z.number().min(0),
});

const Books = () => {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const limit = 20;
  const queryClient = useQueryClient();

  const { data: booksData, isLoading } = useQuery({
    queryKey: ["books", q, page],
    queryFn: () => libraryApi.getBooks({ limit, offset: (page - 1) * limit, search: q }),
    placeholderData: (previousData: any) => previousData,
  });

  const books = booksData?.data || [];
  const totalCount = booksData?.count || 0;
  const { toast } = useToast();
  const totalPages = Math.ceil(totalCount / limit);

  const addMutation = useMutation({
    mutationFn: libraryApi.addBook,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["books"] });
      setOpen(false);
      toast({ title: "Book Added", description: "Book successfully added to library." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "Failed to add book", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: any }) => libraryApi.updateBook(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["books"] });
      setOpen(false);
      toast({ title: "Book Updated", description: "Book successfully updated." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "Failed to update book", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: libraryApi.deleteBook,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["books"] });
      toast({ title: "Book Deleted", description: "Book removed from library." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "Failed to delete book", variant: "destructive" });
    },
  });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Book | null>(null);
  const [form, setForm] = useState<any>({
    title: "",
    author: "",
    category: "",
    isbn: "",
    quantity: 1,
  });

  const openNew = () => {
    setEditing(null);
    setForm({ title: "", author: "", category: "", isbn: "", quantity: 1 });
    setOpen(true);
  };

  const openEdit = (b: Book) => {
    setEditing(b);
    setForm({
      title: b.title,
      author: b.author || "",
      category: b.category || "",
      isbn: b.isbn || "",
      quantity: b.quantity,
      available: b.available,
    });
    setOpen(true);
  };

  const save = async () => {
    try {
      const parsed = bookSchema.parse({ ...form, quantity: Number(form.quantity) });
      if (editing) {
        updateMutation.mutate({
          id: editing.id,
          patch: { ...parsed, available: Number(form.available ?? editing.available) },
        });
      } else {
        addMutation.mutate({ ...parsed, available: Number(parsed.quantity) });
      }
    } catch (err: any) {
      toast({ title: "Invalid Input", description: err?.message || "Please check the entered values.", variant: "destructive" });
    }
  };

  const remove = async (id: string) => {
    deleteMutation.mutate(id);
  };

  return (
    <LibraryLayout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <h2 className="text-2xl font-bold">Books</h2>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search books..."
            className="flex-1 sm:w-64 px-3 py-2 border rounded"
          />
          <Button onClick={openNew}>Add Book</Button>
        </div>
      </div>

      <div className="overflow-x-auto bg-card rounded shadow p-2">
        <table className="w-full min-w-[600px] text-left">
          <thead>
            <tr>
              <th>Title</th>
              <th>Author</th>
              <th>Category</th>
              <th>ISBN</th>
              <th>Qty</th>
              <th>Available</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="text-center py-4">
                  Loading...
                </td>
              </tr>
            ) : books.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-4">
                  No books found
                </td>
              </tr>
            ) : (
              books.map((b) => (
                <tr key={b.id} className="border-t border-border">
                  <td>{b.title}</td>
                  <td>{b.author}</td>
                  <td>{b.category}</td>
                  <td>{b.isbn}</td>
                  <td>{b.quantity}</td>
                  <td>{b.available}</td>
                  <td className="text-right">
                    <div className="inline-flex gap-2">
                      <Button onClick={() => openEdit(b)}>Edit</Button>
                      <Button size="sm" variant="destructive" className="gap-1.5" onClick={() => remove(b.id)}>
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <PaginationControls
        currentPage={page}
        totalPages={totalPages}
        pageSize={limit}
        totalItems={totalCount}
        onPageChange={setPage}
        onPageSizeChange={() => {}}
        showPageSizeSelector={false}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Book" : "Add Book"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e: any) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div>
              <Label>Author</Label>
              <Input
                value={form.author}
                onChange={(e: any) => setForm({ ...form, author: e.target.value })}
              />
            </div>
            <div>
              <Label>Category</Label>
              <Input
                value={form.category}
                onChange={(e: any) => setForm({ ...form, category: e.target.value })}
              />
            </div>
            <div>
              <Label>ISBN</Label>
              <Input
                value={form.isbn}
                onChange={(e: any) => setForm({ ...form, isbn: e.target.value })}
              />
            </div>
            <div>
              <Label>Quantity</Label>
              <Input
                type="number"
                value={form.quantity}
                onChange={(e: any) => setForm({ ...form, quantity: Number(e.target.value) })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save}>{editing ? "Save" : "Create"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </LibraryLayout>
  );
};

export default Books;
