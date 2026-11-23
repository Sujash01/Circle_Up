import React, { useCallback, useEffect, useState } from 'react';
import { Mail, Search, RefreshCw, MessageSquare, CheckCircle, Clock, XCircle, Send } from 'lucide-react';
import { adminApi } from '../services/adminApi';
import { useAdminToast } from '../context/AdminToastContext';
import { AdminTableSkeleton } from '../components/AdminSkeleton';

interface Inquiry {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  category: string;
  subject: string;
  message: string;
  status: 'NEW' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  notes: string | null;
  reply: string | null;
  repliedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function InquiriesPage() {
  const { showToast } = useAdminToast();
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedInquiry, setSelectedInquiry] = useState<Inquiry | null>(null);
  const [notesInput, setNotesInput] = useState('');
  const [replyInput, setReplyInput] = useState('');
  const [statusInput, setStatusInput] = useState<'NEW' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'>('NEW');
  const [submitting, setSubmitting] = useState(false);

  const fetchInquiries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.getInquiries({
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        search: searchTerm.trim() || undefined,
      });
      const data = (res as { data: Inquiry[] })?.data || [];
      setInquiries(data);
    } catch (err: unknown) {
      showToast('error', err instanceof Error ? err.message : 'Failed to fetch inquiries.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchTerm, showToast]);

  useEffect(() => {
    fetchInquiries();
  }, [fetchInquiries]);

  const handleOpenDetail = (inquiry: Inquiry) => {
    setSelectedInquiry(inquiry);
    setNotesInput(inquiry.notes || '');
    setReplyInput('');
    setStatusInput(inquiry.status);
  };

  const handleSaveInquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInquiry) return;
    setSubmitting(true);
    try {
      const updated = (await adminApi.updateInquiry(selectedInquiry.id, {
        status: statusInput,
        notes: notesInput.trim() || undefined,
        reply: replyInput.trim() || undefined,
      })) as Inquiry;

      showToast('success', replyInput.trim() ? 'Reply sent to customer!' : 'Inquiry updated successfully.');
      setSelectedInquiry(updated);
      setInquiries((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      if (replyInput.trim()) setReplyInput('');
    } catch (err: unknown) {
      showToast('error', err instanceof Error ? err.message : 'Failed to update inquiry.');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: Inquiry['status']) => {
    switch (status) {
      case 'NEW':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-terracotta/15 text-terracotta border border-terracotta/30"><Clock className="size-3" /> New</span>;
      case 'IN_PROGRESS':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-700 border border-amber-500/30"><Clock className="size-3" /> In Progress</span>;
      case 'RESOLVED':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-forest/15 text-forest-deep border border-forest/30"><CheckCircle className="size-3" /> Resolved</span>;
      case 'CLOSED':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-500/15 text-gray-700 border border-gray-400/30"><XCircle className="size-3" /> Closed</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-cocoa">Customer Inquiries Inbox</h1>
          <p className="text-xs text-cocoa/70">
            View customer questions, order support messages, manage internal notes, and send email replies.
          </p>
        </div>
        <button
          onClick={fetchInquiries}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-semibold text-cocoa hover:text-primary transition-colors self-start sm:self-auto"
        >
          <RefreshCw className="size-3.5" />
          Refresh
        </button>
      </div>

      {/* Filter Tabs and Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {(['ALL', 'NEW', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                statusFilter === tab
                  ? 'bg-forest-deep text-white shadow-sm'
                  : 'bg-card border border-border text-cocoa/80 hover:bg-forest/5'
              }`}
            >
              {tab.replace('_', ' ')}
            </button>
          ))}
        </div>
        <div className="relative min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-cocoa/50" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name, email, subject..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-card border border-border rounded-lg text-cocoa focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* Inquiry List & Detail Split View */}
      {loading ? (
        <AdminTableSkeleton rows={5} />
      ) : inquiries.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center space-y-3">
          <Mail className="size-10 mx-auto text-cocoa/40" />
          <h3 className="font-display text-lg font-bold text-cocoa">No inquiries found</h3>
          <p className="text-xs text-cocoa/70">No customer support messages match the selected criteria.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* List column */}
          <div className="lg:col-span-6 space-y-3">
            {inquiries.map((inquiry) => {
              const isSelected = selectedInquiry?.id === inquiry.id;
              return (
                <div
                  key={inquiry.id}
                  onClick={() => handleOpenDetail(inquiry)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-card border-forest-deep shadow-md ring-1 ring-forest-deep'
                      : 'bg-card/70 border-border hover:bg-card hover:border-cocoa/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <span className="font-bold text-sm text-cocoa">{inquiry.name}</span>
                    {getStatusBadge(inquiry.status)}
                  </div>
                  <p className="text-xs font-semibold text-forest-deep truncate mb-1">{inquiry.subject}</p>
                  <p className="text-xs text-cocoa/70 line-clamp-2 mb-2">{inquiry.message}</p>
                  <div className="flex items-center justify-between text-[0.7rem] text-cocoa/50 pt-2 border-t border-border/50">
                    <span>{inquiry.email} {inquiry.phone ? `• ${inquiry.phone}` : ''}</span>
                    <span>{new Date(inquiry.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Detail & Reply column */}
          <div className="lg:col-span-6">
            {selectedInquiry ? (
              <div className="bg-card border border-border rounded-xl p-6 space-y-5 sticky top-24">
                <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
                  <div>
                    <h2 className="font-display text-lg font-bold text-cocoa">{selectedInquiry.subject}</h2>
                    <p className="text-xs text-cocoa/70">From: {selectedInquiry.name} ({selectedInquiry.email})</p>
                    {selectedInquiry.phone && <p className="text-xs text-cocoa/70">Phone: {selectedInquiry.phone}</p>}
                  </div>
                  {getStatusBadge(selectedInquiry.status)}
                </div>

                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-cocoa/60 mb-1.5">Message</h4>
                  <div className="bg-[#f8f4e2]/60 p-3.5 rounded-lg border border-border text-xs text-cocoa whitespace-pre-wrap leading-relaxed">
                    {selectedInquiry.message}
                  </div>
                </div>

                <form onSubmit={handleSaveInquiry} className="space-y-4 pt-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-cocoa mb-1">Status</label>
                      <select
                        value={statusInput}
                        onChange={(e) => setStatusInput(e.target.value as Inquiry['status'])}
                        className="w-full text-xs bg-background border border-border rounded-lg px-2.5 py-1.5 text-cocoa focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value="NEW">New</option>
                        <option value="IN_PROGRESS">In Progress</option>
                        <option value="RESOLVED">Resolved</option>
                        <option value="CLOSED">Closed</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-cocoa mb-1">Internal Staff Notes</label>
                    <textarea
                      rows={2}
                      value={notesInput}
                      onChange={(e) => setNotesInput(e.target.value)}
                      placeholder="Add private staff notes about this inquiry..."
                      className="w-full text-xs bg-background border border-border rounded-lg p-2.5 text-cocoa focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-cocoa mb-1 flex items-center justify-between">
                      <span>Send Email Reply</span>
                      {selectedInquiry.repliedAt && (
                        <span className="text-[0.7rem] text-forest font-normal">
                          Last replied {new Date(selectedInquiry.repliedAt).toLocaleDateString()}
                        </span>
                      )}
                    </label>
                    <textarea
                      rows={4}
                      value={replyInput}
                      onChange={(e) => setReplyInput(e.target.value)}
                      placeholder={`Type your reply to ${selectedInquiry.email}...`}
                      className="w-full text-xs bg-background border border-border rounded-lg p-2.5 text-cocoa focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="submit"
                      disabled={submitting}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-forest-deep text-white text-xs font-bold hover:bg-forest transition-colors disabled:opacity-50"
                    >
                      <Send className="size-3.5" />
                      {replyInput.trim() ? 'Send Reply & Save' : 'Update Inquiry'}
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="bg-card border border-border rounded-xl p-12 text-center text-cocoa/60 flex flex-col items-center justify-center min-h-[300px]">
                <MessageSquare className="size-10 mb-2 opacity-40" />
                <p className="text-xs font-medium">Select an inquiry from the left to view details and reply.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
