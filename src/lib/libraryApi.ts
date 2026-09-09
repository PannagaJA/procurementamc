import { supabase } from '@/integrations/supabase/client';

const LS_KEYS = {
  BOOKS: 'lib_books',
  MEMBERS: 'lib_members',
  ISSUES: 'lib_issues',
};

const useLocal = async (key: string) => {
  return JSON.parse(localStorage.getItem(key) || '[]');
};

export const libraryApi = {
  // Books
  async getBooks({ limit = 50, offset = 0, search = '' }: { limit?: number; offset?: number; search?: string } = {}) {
    try {
      let query = supabase.from('library_books').select('*', { count: 'exact' });

      if (search) {
        query = query.or(`title.ilike.%${search}%,author.ilike.%${search}%,isbn.ilike.%${search}%`);
      }

      const { data, error, count } = await query
        .order('title')
        .range(offset, offset + limit - 1);

      if (error) throw error;
      return { data: data || [], count: count || 0 };
    } catch (e) {
      console.error('Failed to fetch books:', e);
      return { data: [], count: 0 };
    }
  },

  async addBook(book: any) {
    try {
      const { data, error } = await supabase.from('library_books').insert(book).select();
      if (error) throw error;
      return data?.[0];
    } catch (e) {
      const books = JSON.parse(localStorage.getItem(LS_KEYS.BOOKS) || '[]');
      const b = { ...book, id: Date.now().toString() };
      books.unshift(b);
      localStorage.setItem(LS_KEYS.BOOKS, JSON.stringify(books));
      return b;
    }
  },

  async updateBook(id: string, patch: any) {
    try {
      const { data, error } = await supabase.from('library_books').update(patch).eq('id', id).select();
      if (error) throw error;
      return data?.[0];
    } catch (e) {
      const books = JSON.parse(localStorage.getItem(LS_KEYS.BOOKS) || '[]');
      const updated = books.map((b:any) => b.id === id ? { ...b, ...patch } : b);
      localStorage.setItem(LS_KEYS.BOOKS, JSON.stringify(updated));
      return updated.find((b:any)=>b.id===id);
    }
  },

  async deleteBook(id: string) {
    try {
      const { error } = await supabase.from('library_books').delete().eq('id', id);
      if (error) throw error;
      return true;
    } catch (e) {
      const books = JSON.parse(localStorage.getItem(LS_KEYS.BOOKS) || '[]');
      const updated = books.filter((b:any)=>b.id!==id);
      localStorage.setItem(LS_KEYS.BOOKS, JSON.stringify(updated));
      return true;
    }
  },

  // Members
  async getMembers() {
    try {
      const { data, error } = await supabase.from('library_members').select('*').order('name');
      if (error) throw error;
      return data || [];
    } catch (e) {
      return useLocal(LS_KEYS.MEMBERS);
    }
  },

  async addMember(member: any) {
    try {
      const { data, error } = await supabase.from('library_members').insert(member).select();
      if (error) throw error;
      return data?.[0];
    } catch (e) {
      const list = JSON.parse(localStorage.getItem(LS_KEYS.MEMBERS) || '[]');
      const m = { ...member, id: Date.now().toString() };
      list.unshift(m);
      localStorage.setItem(LS_KEYS.MEMBERS, JSON.stringify(list));
      return m;
    }
  },

  async updateMember(id: string, patch: any) {
    try {
      const { data, error } = await supabase.from('library_members').update(patch).eq('id', id).select();
      if (error) throw error;
      return data?.[0];
    } catch (e) {
      const list = JSON.parse(localStorage.getItem(LS_KEYS.MEMBERS) || '[]');
      const updated = list.map((m:any)=> m.id===id ? { ...m, ...patch } : m);
      localStorage.setItem(LS_KEYS.MEMBERS, JSON.stringify(updated));
      return updated.find((m:any)=>m.id===id);
    }
  },

  async deleteMember(id: string) {
    try {
      const { error } = await supabase.from('library_members').delete().eq('id', id);
      if (error) throw error;
      return true;
    } catch (e) {
      const list = JSON.parse(localStorage.getItem(LS_KEYS.MEMBERS) || '[]');
      const updated = list.filter((m:any)=>m.id!==id);
      localStorage.setItem(LS_KEYS.MEMBERS, JSON.stringify(updated));
      return true;
    }
  },

  // Issues
  async getIssues() {
    try {
      const { data, error } = await supabase.from('library_issues').select('*').order('issue_date', { ascending: false });
      if (error) throw error;
      const rows = data || [];
      return rows.map((r:any) => ({
        id: r.id,
        bookId: r.book_id,
        memberId: r.member_id,
        issueDate: r.issue_date,
        dueDate: r.due_date,
        createdAt: r.created_at
      }));
    } catch (e) {
      return useLocal(LS_KEYS.ISSUES);
    }
  },

  async issueBook(payload: any) {
    try {
      const dbPayload = {
        book_id: payload.bookId,
        member_id: payload.memberId,
        issue_date: payload.issueDate,
        due_date: payload.dueDate
      };
      const { data, error } = await supabase.from('library_issues').insert(dbPayload).select();
      if (error) throw error;
      const row = data?.[0];
      return row ? {
        id: row.id,
        bookId: row.book_id,
        memberId: row.member_id,
        issueDate: row.issue_date,
        dueDate: row.due_date,
        createdAt: row.created_at
      } : null;
    } catch (e) {
      const list = JSON.parse(localStorage.getItem(LS_KEYS.ISSUES) || '[]');
      const rec = { ...payload, id: Date.now().toString() };
      list.unshift(rec);
      localStorage.setItem(LS_KEYS.ISSUES, JSON.stringify(list));
      // also update local book
      const books = JSON.parse(localStorage.getItem(LS_KEYS.BOOKS) || '[]');
      const updated = books.map((b:any)=> b.id===payload.bookId ? { ...b, available: (b.available||0)-1 } : b);
      localStorage.setItem(LS_KEYS.BOOKS, JSON.stringify(updated));
      return rec;
    }
  },

  async returnBook(issueId: string) {
    try {
      const { data: issueData, error: issueError } = await supabase.from('library_issues').select('*').eq('id', issueId).maybeSingle();
      if (issueError) throw issueError;
      if (!issueData) throw new Error('Issue not found');
      const { error: delErr } = await supabase.from('library_issues').delete().eq('id', issueId);
      if (delErr) throw delErr;
      // update book available
      // DB trigger will adjust `library_books.available`; nothing else required here.
      return true;
    } catch (e) {
      const list = JSON.parse(localStorage.getItem(LS_KEYS.ISSUES) || '[]');
      const issue = list.find((i:any)=>i.id===issueId);
      if (!issue) return false;
      const updated = list.filter((i:any)=>i.id!==issueId);
      localStorage.setItem(LS_KEYS.ISSUES, JSON.stringify(updated));
      const books = JSON.parse(localStorage.getItem(LS_KEYS.BOOKS) || '[]');
      const newBooks = books.map((b:any)=> b.id===issue.bookId ? { ...b, available: (b.available||0)+1 } : b);
      localStorage.setItem(LS_KEYS.BOOKS, JSON.stringify(newBooks));
      return true;
    }
  },

  // Reminders (stub)
  async sendDueReminders() {
    try {
      // attempt invoking a supabase function named 'send-due-reminders'
      // If not available, just return false
      // @ts-ignore
      if (supabase.functions) {
        // @ts-ignore
        await supabase.functions.invoke('send-due-reminders');
        return true;
      }
      return false;
    } catch (e) {
      console.error('Failed to send reminders', e);
      return false;
    }
  }
};

export default libraryApi;
