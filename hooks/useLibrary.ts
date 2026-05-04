/**
 * Library hooks — catalog, transactions, collections, settings, patron search.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type {
  LibraryBook, LibraryCollection, LibraryTransaction, LibrarySettings,
  LibraryBookStatus, LibraryTransactionStatus,
} from '../types/database';

// ─── types ────────────────────────────────────────────────────────────────────

export interface BookFilters {
  search?: string;
  collectionId?: string;
  status?: LibraryBookStatus | 'all';
}

export interface TransactionFilters {
  status?: LibraryTransactionStatus | 'all';
  borrowerType?: 'staff' | 'student' | 'all';
}

export interface OverdueBook {
  transaction_id: string;
  book_title: string;
  accession_number: string;
  borrower_name: string;
  borrower_type: string;
  due_date: string;
  days_overdue: number;
  checked_out_at: string;
}

export interface DashboardStats {
  total_books: number;
  available: number;
  checked_out: number;
  overdue: number;
  lost: number;
  collections: number;
}

export interface PatronResult {
  id: string;
  full_name: string;
  type: 'staff' | 'student';
  identifier: string; // staff_number or student_number
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export function useLibraryDashboard(schoolId: string) {
  return useQuery<DashboardStats>({
    queryKey: ['library-dashboard', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_library_dashboard_stats', {
        p_school_id: schoolId,
      });
      if (error) throw error;
      return data as DashboardStats;
    },
  });
}

export function useOverdueBooks(schoolId: string) {
  return useQuery<OverdueBook[]>({
    queryKey: ['library-overdue', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_overdue_books', {
        p_school_id: schoolId,
      });
      if (error) throw error;
      return (data ?? []) as OverdueBook[];
    },
  });
}

// ─── Books ────────────────────────────────────────────────────────────────────

export function useLibraryBooks(schoolId: string, filters?: BookFilters) {
  return useQuery<LibraryBook[]>({
    queryKey: ['library-books', schoolId, filters],
    enabled: !!schoolId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const db = supabase as any;
      let q = db
        .from('library_books')
        .select(`
          id, school_id, title, author, isbn, publisher, publish_year,
          cover_url, accession_number, barcode, status, collection_id,
          total_copies, available_copies, added_by, notes, created_at, updated_at,
          collection:collection_id ( name )
        `)
        .eq('school_id', schoolId);

      if (filters?.status && filters.status !== 'all') {
        q = q.eq('status', filters.status);
      }
      if (filters?.collectionId) {
        q = q.eq('collection_id', filters.collectionId);
      }
      if (filters?.search) {
        q = q.or(`title.ilike.%${filters.search}%,author.ilike.%${filters.search}%,accession_number.ilike.%${filters.search}%,isbn.ilike.%${filters.search}%`);
      }

      const { data, error } = await q.order('created_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r: any): LibraryBook => ({
        ...r,
        collection_name: r.collection?.name ?? null,
      }));
    },
  });
}

export function useLibraryBook(bookId: string | null) {
  return useQuery<LibraryBook | null>({
    queryKey: ['library-book', bookId],
    enabled: !!bookId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const db = supabase as any;
      const { data, error } = await db
        .from('library_books')
        .select(`
          *, collection:collection_id ( name )
        `)
        .eq('id', bookId)
        .single();
      if (error) throw error;
      return { ...data, collection_name: data.collection?.name ?? null } as LibraryBook;
    },
  });
}

export function useBookByBarcode(schoolId: string) {
  const qc = useQueryClient();
  return useMutation<LibraryBook | null, Error, string>({
    mutationFn: async (barcode: string) => {
      const db = supabase as any;
      const { data, error } = await db
        .from('library_books')
        .select('*')
        .eq('school_id', schoolId)
        .eq('barcode', barcode)
        .maybeSingle();
      if (error) throw error;
      return data as LibraryBook | null;
    },
  });
}

export function useCreateBook(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      title: string;
      author?: string;
      isbn?: string;
      publisher?: string;
      publishYear?: number;
      coverUrl?: string;
      accessionNumber: string;
      barcode?: string;
      collectionId?: string;
      totalCopies?: number;
      notes?: string;
      staffId: string;
    }) => {
      const db = supabase as any;
      const copies = params.totalCopies ?? 1;
      const { error } = await db.from('library_books').insert({
        school_id: schoolId,
        title: params.title,
        author: params.author ?? null,
        isbn: params.isbn ?? null,
        publisher: params.publisher ?? null,
        publish_year: params.publishYear ?? null,
        cover_url: params.coverUrl ?? null,
        accession_number: params.accessionNumber,
        barcode: params.barcode ?? params.accessionNumber,
        collection_id: params.collectionId ?? null,
        total_copies: copies,
        available_copies: copies,
        added_by: params.staffId,
        notes: params.notes ?? null,
        status: 'available',
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['library-books', schoolId] }),
  });
}

export function useUpdateBook(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      bookId: string;
      title?: string;
      author?: string;
      isbn?: string;
      publisher?: string;
      publishYear?: number;
      coverUrl?: string;
      accessionNumber?: string;
      barcode?: string;
      collectionId?: string | null;
      totalCopies?: number;
      availableCopies?: number;
      status?: LibraryBookStatus;
      notes?: string;
    }) => {
      const db = supabase as any;
      const update: any = { updated_at: new Date().toISOString() };
      if (params.title !== undefined) update.title = params.title;
      if (params.author !== undefined) update.author = params.author;
      if (params.isbn !== undefined) update.isbn = params.isbn;
      if (params.publisher !== undefined) update.publisher = params.publisher;
      if (params.publishYear !== undefined) update.publish_year = params.publishYear;
      if (params.coverUrl !== undefined) update.cover_url = params.coverUrl;
      if (params.accessionNumber !== undefined) update.accession_number = params.accessionNumber;
      if (params.barcode !== undefined) update.barcode = params.barcode;
      if (params.collectionId !== undefined) update.collection_id = params.collectionId;
      if (params.totalCopies !== undefined) update.total_copies = params.totalCopies;
      if (params.availableCopies !== undefined) update.available_copies = params.availableCopies;
      if (params.status !== undefined) update.status = params.status;
      if (params.notes !== undefined) update.notes = params.notes;

      const { error } = await db
        .from('library_books')
        .update(update)
        .eq('id', params.bookId)
        .eq('school_id', schoolId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['library-books', schoolId] });
      qc.invalidateQueries({ queryKey: ['library-book', vars.bookId] });
      qc.invalidateQueries({ queryKey: ['library-dashboard', schoolId] });
    },
  });
}

export function useDeleteBook(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bookId: string) => {
      const db = supabase as any;
      const { error } = await db
        .from('library_books')
        .delete()
        .eq('id', bookId)
        .eq('school_id', schoolId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['library-books', schoolId] });
      qc.invalidateQueries({ queryKey: ['library-dashboard', schoolId] });
    },
  });
}

export function useImportBooks(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (books: Array<{
      title: string;
      author?: string;
      isbn?: string;
      publisher?: string;
      publishYear?: number;
      accessionNumber: string;
      barcode?: string;
      collectionId?: string;
      totalCopies?: number;
      staffId: string;
    }>) => {
      const db = supabase as any;
      const rows = books.map((b) => ({
        school_id: schoolId,
        title: b.title,
        author: b.author ?? null,
        isbn: b.isbn ?? null,
        publisher: b.publisher ?? null,
        publish_year: b.publishYear ?? null,
        accession_number: b.accessionNumber,
        barcode: b.barcode ?? b.accessionNumber,
        collection_id: b.collectionId ?? null,
        total_copies: b.totalCopies ?? 1,
        available_copies: b.totalCopies ?? 1,
        added_by: b.staffId,
        status: 'available',
      }));
      const { error } = await db.from('library_books').insert(rows);
      if (error) throw error;
      return { count: rows.length };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['library-books', schoolId] });
      qc.invalidateQueries({ queryKey: ['library-dashboard', schoolId] });
    },
  });
}

// ─── Collections ──────────────────────────────────────────────────────────────

export function useLibraryCollections(schoolId: string) {
  return useQuery<LibraryCollection[]>({
    queryKey: ['library-collections', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const db = supabase as any;
      const { data, error } = await db
        .from('library_collections')
        .select('*')
        .eq('school_id', schoolId)
        .order('name');
      if (error) throw error;
      return (data ?? []) as LibraryCollection[];
    },
  });
}

export function useCreateCollection(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { name: string; description?: string; color?: string; icon?: string }) => {
      const db = supabase as any;
      const { error } = await db.from('library_collections').insert({
        school_id: schoolId,
        name: params.name,
        description: params.description ?? null,
        color: params.color ?? '#3B82F6',
        icon: params.icon ?? 'library-outline',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['library-collections', schoolId] });
      qc.invalidateQueries({ queryKey: ['library-dashboard', schoolId] });
    },
  });
}

export function useUpdateCollection(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; name?: string; description?: string; color?: string; icon?: string }) => {
      const db = supabase as any;
      const update: any = { updated_at: new Date().toISOString() };
      if (params.name !== undefined) update.name = params.name;
      if (params.description !== undefined) update.description = params.description;
      if (params.color !== undefined) update.color = params.color;
      if (params.icon !== undefined) update.icon = params.icon;
      const { error } = await db
        .from('library_collections')
        .update(update)
        .eq('id', params.id)
        .eq('school_id', schoolId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['library-collections', schoolId] }),
  });
}

export function useDeleteCollection(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const db = supabase as any;
      const { error } = await db
        .from('library_collections')
        .delete()
        .eq('id', id)
        .eq('school_id', schoolId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['library-collections', schoolId] });
      qc.invalidateQueries({ queryKey: ['library-dashboard', schoolId] });
    },
  });
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export function useLibraryTransactions(schoolId: string, filters?: TransactionFilters) {
  return useQuery<LibraryTransaction[]>({
    queryKey: ['library-transactions', schoolId, filters],
    enabled: !!schoolId,
    staleTime: 1000 * 15,
    queryFn: async () => {
      const db = supabase as any;
      let q = db
        .from('library_transactions')
        .select(`
          id, school_id, book_id, borrower_type, borrower_staff_id,
          borrower_student_id, checked_out_at, due_date, checked_in_at,
          checked_out_by, checked_in_by, status, notes, created_at,
          book:book_id ( title, accession_number ),
          staff_borrower:borrower_staff_id ( full_name ),
          student_borrower:borrower_student_id ( full_name )
        `)
        .eq('school_id', schoolId);

      if (filters?.status && filters.status !== 'all') {
        q = q.eq('status', filters.status);
      }
      if (filters?.borrowerType && filters.borrowerType !== 'all') {
        q = q.eq('borrower_type', filters.borrowerType);
      }

      const { data, error } = await q.order('created_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r: any): LibraryTransaction => ({
        ...r,
        book_title: r.book?.title ?? '—',
        accession_number: r.book?.accession_number ?? '—',
        borrower_name:
          r.borrower_type === 'staff'
            ? r.staff_borrower?.full_name ?? '—'
            : r.student_borrower?.full_name ?? '—',
      }));
    },
  });
}

export function useBookTransactions(bookId: string | null) {
  return useQuery<LibraryTransaction[]>({
    queryKey: ['library-book-transactions', bookId],
    enabled: !!bookId,
    staleTime: 1000 * 15,
    queryFn: async () => {
      const db = supabase as any;
      const { data, error } = await db
        .from('library_transactions')
        .select(`
          *, book:book_id ( title, accession_number ),
          staff_borrower:borrower_staff_id ( full_name ),
          student_borrower:borrower_student_id ( full_name )
        `)
        .eq('book_id', bookId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r: any): LibraryTransaction => ({
        ...r,
        book_title: r.book?.title ?? '—',
        accession_number: r.book?.accession_number ?? '—',
        borrower_name:
          r.borrower_type === 'staff'
            ? r.staff_borrower?.full_name ?? '—'
            : r.student_borrower?.full_name ?? '—',
      }));
    },
  });
}

export function useCheckOutBook(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      bookId: string;
      borrowerType: 'staff' | 'student';
      borrowerId: string;
      dueDate: string;
      staffId: string;
      notes?: string;
    }) => {
      const db = supabase as any;
      const { data, error } = await db.rpc('library_check_out', {
        p_school_id: schoolId,
        p_book_id: params.bookId,
        p_borrower_type: params.borrowerType,
        p_borrower_id: params.borrowerId,
        p_due_date: params.dueDate,
        p_staff_id: params.staffId,
        p_notes: params.notes ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['library-books', schoolId] });
      qc.invalidateQueries({ queryKey: ['library-book', vars.bookId] });
      qc.invalidateQueries({ queryKey: ['library-transactions', schoolId] });
      qc.invalidateQueries({ queryKey: ['library-book-transactions', vars.bookId] });
      qc.invalidateQueries({ queryKey: ['library-dashboard', schoolId] });
    },
  });
}

export function useCheckInBook(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      transactionId: string;
      bookId: string;
      staffId: string;
      notes?: string;
    }) => {
      const db = supabase as any;
      const { error } = await db.rpc('library_check_in', {
        p_school_id: schoolId,
        p_transaction_id: params.transactionId,
        p_book_id: params.bookId,
        p_staff_id: params.staffId,
        p_notes: params.notes ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['library-books', schoolId] });
      qc.invalidateQueries({ queryKey: ['library-book', vars.bookId] });
      qc.invalidateQueries({ queryKey: ['library-transactions', schoolId] });
      qc.invalidateQueries({ queryKey: ['library-book-transactions', vars.bookId] });
      qc.invalidateQueries({ queryKey: ['library-dashboard', schoolId] });
      qc.invalidateQueries({ queryKey: ['library-overdue', schoolId] });
    },
  });
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export function useLibrarySettings(schoolId: string) {
  return useQuery<LibrarySettings | null>({
    queryKey: ['library-settings', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const db = supabase as any;
      const { data, error } = await db
        .from('library_settings')
        .select('*')
        .eq('school_id', schoolId)
        .maybeSingle();
      if (error) throw error;
      return data as LibrarySettings | null;
    },
  });
}

export function useUpsertLibrarySettings(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      defaultLoanDays?: number;
      maxBooksPerStudent?: number;
      maxBooksPerStaff?: number;
      overdueNotificationDays?: number;
    }) => {
      const db = supabase as any;
      const { error } = await db
        .from('library_settings')
        .upsert({
          school_id: schoolId,
          default_loan_days: params.defaultLoanDays ?? 14,
          max_books_per_student: params.maxBooksPerStudent ?? 3,
          max_books_per_staff: params.maxBooksPerStaff ?? 5,
          overdue_notification_days: params.overdueNotificationDays ?? 3,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'school_id' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['library-settings', schoolId] }),
  });
}

// ─── Patron search ────────────────────────────────────────────────────────────

export function usePatronSearch(schoolId: string, query: string, type: 'staff' | 'student' | 'all') {
  return useQuery<PatronResult[]>({
    queryKey: ['library-patron-search', schoolId, query, type],
    enabled: !!schoolId && query.length >= 2,
    staleTime: 1000 * 10,
    queryFn: async () => {
      const db = supabase as any;
      const results: PatronResult[] = [];
      const q = `%${query}%`;

      if (type === 'staff' || type === 'all') {
        const { data: staffData } = await db
          .from('staff')
          .select('id, full_name, staff_number')
          .eq('school_id', schoolId)
          .eq('status', 'active')
          .ilike('full_name', q)
          .limit(15);
        (staffData ?? []).forEach((s: any) => {
          results.push({ id: s.id, full_name: s.full_name, type: 'staff', identifier: s.staff_number });
        });
      }

      if (type === 'student' || type === 'all') {
        const { data: studentData } = await db
          .from('students')
          .select('id, full_name, student_number')
          .eq('school_id', schoolId)
          .ilike('full_name', q)
          .limit(15);
        (studentData ?? []).forEach((s: any) => {
          results.push({ id: s.id, full_name: s.full_name, type: 'student', identifier: s.student_number ?? '' });
        });
      }

      return results;
    },
  });
}

// ─── Patron loan history ─────────────────────────────────────────────────────

export function usePatronLoans(patronId: string | null, patronType: 'staff' | 'student') {
  return useQuery<LibraryTransaction[]>({
    queryKey: ['library-patron-loans', patronId, patronType],
    enabled: !!patronId,
    staleTime: 1000 * 15,
    queryFn: async () => {
      const db = supabase as any;
      const col = patronType === 'staff' ? 'borrower_staff_id' : 'borrower_student_id';
      const { data, error } = await db
        .from('library_transactions')
        .select(`
          *, book:book_id ( title, accession_number ),
          staff_borrower:borrower_staff_id ( full_name ),
          student_borrower:borrower_student_id ( full_name )
        `)
        .eq(col, patronId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r: any): LibraryTransaction => ({
        ...r,
        book_title: r.book?.title ?? '—',
        accession_number: r.book?.accession_number ?? '—',
        borrower_name:
          r.borrower_type === 'staff'
            ? r.staff_borrower?.full_name ?? '—'
            : r.student_borrower?.full_name ?? '—',
      }));
    },
  });
}
