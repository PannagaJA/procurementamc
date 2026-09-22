import { useEffect, useState } from "react";
import LibraryLayout from "@/components/library/LibraryLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import libraryApi from "@/lib/libraryApi";
import { z } from "zod";

interface Member {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  membershipDate: string;
}

const memberSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  address: z.string().optional(),
});

const Members = () => {
  const [members, setMembers] = useState<Member[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [form, setForm] = useState<any>({ name: "", email: "", phone: "", address: "" });

  const load = async () => {
    const res = await libraryApi.getMembers();
    setMembers(res.data || []);
  };

  useEffect(() => {
    load();
  }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", email: "", phone: "", address: "" });
    setOpen(true);
  };
  const openEdit = (m: Member) => {
    setEditing(m);
    setForm({ ...m });
    setOpen(true);
  };

  const save = async () => {
    try {
      const parsed = memberSchema.parse(form);
      if (editing) {
        await libraryApi.updateMember(editing.id, parsed);
      } else {
        await libraryApi.addMember({
          ...parsed,
          membershipDate: new Date().toISOString().slice(0, 10),
        });
      }
      await load();
      setOpen(false);
    } catch (err: any) {
      alert(err.message || "Invalid input");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete member?")) return;
    await libraryApi.deleteMember(id);
    await load();
  };

  const filtered = members.filter(
    (m) =>
      m.name.toLowerCase().includes(q.toLowerCase()) ||
      m.email.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <LibraryLayout>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">Members</h2>
        <div className="flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            className="px-3 py-2 border rounded"
          />
          <Button onClick={openNew}>Add Member</Button>
        </div>
      </div>

      <div className="overflow-x-auto bg-card rounded shadow p-2">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Membership Date</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => (
              <tr key={m.id} className="border-t border-border">
                <td>{m.name}</td>
                <td>{m.email}</td>
                <td>{m.phone || "-"}</td>
                <td>{m.membershipDate}</td>
                <td className="text-right">
                  <div className="inline-flex gap-2">
                    <Button onClick={() => openEdit(m)}>Edit</Button>
                    <Button variant="ghost" onClick={() => remove(m.id)}>
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Member" : "Add Member"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e: any) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                value={form.email}
                onChange={(e: any) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                value={form.phone}
                onChange={(e: any) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div>
              <Label>Address</Label>
              <Input
                value={form.address}
                onChange={(e: any) => setForm({ ...form, address: e.target.value })}
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

export default Members;
