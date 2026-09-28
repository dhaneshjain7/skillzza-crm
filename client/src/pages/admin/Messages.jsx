import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import StatusBadge from '../../components/common/StatusBadge';
import API from '../../api/axios';
import AttachmentBubble, { getFileCategory } from '../../components/chat/AttachmentBubble';

const ACCEPT_TYPES = '.jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx';
const PENDING_FILE_ICONS = { image: '🖼️', pdf: '📕', word: '📘', excel: '📗', other: '📎' };

const AdminMessages = () => {
  const { user }                             = useAuth();
  const { socket, joinSchool, sendTyping }   = useSocket();
  const [conversations, setConversations]    = useState([]);
  const [activeSchool,  setActiveSchool]     = useState(null);
  const [messages,      setMessages]         = useState([]);
  const [content,       setContent]          = useState('');
  const [loading,       setLoading]          = useState(true);
  const [sending,       setSending]          = useState(false);
  const [otherTyping,   setOtherTyping]      = useState(false);
  const [search,        setSearch]           = useState('');
  const [pendingFile,   setPendingFile]      = useState(null);
  const [fileError,     setFileError]        = useState('');
  const bottomRef  = useRef(null);
  const typingRef  = useRef(null);
  const inputRef   = useRef(null);
  const fileRef    = useRef(null);
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const fetchConvos = async () => {
      try {
        const res = await API.get('/messages/conversations');
        setConversations(res.data.conversations || []);

        const requestedSchoolId = searchParams.get('schoolId');

        if (requestedSchoolId) {
          const match = res.data.conversations?.find(c => c.school._id === requestedSchoolId);
          if (match) {
            openConversation(match.school);
          } else {
            // Not in the loaded conversation list (e.g. brand-new school) — fetch it directly
            try {
              const schoolRes = await API.get(`/schools/${requestedSchoolId}`);
              if (schoolRes.data.school) openConversation(schoolRes.data.school);
            } catch (e) { console.error(e); }
          }
        } else if (res.data.conversations?.length > 0) {
          openConversation(res.data.conversations[0].school);
        }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    fetchConvos();
  }, []);

  const openConversation = async (school) => {
    setActiveSchool(school);
    joinSchool(school._id);
    try {
      const res = await API.get(`/messages/school/${school._id}?limit=100`);
      setMessages(res.data.messages || []);
      const convRes = await API.get('/messages/conversations');
      setConversations(convRes.data.conversations || []);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    if (!socket || !activeSchool) return;

    const onNewMsg = (msg) => {
      if (String(msg.school) !== String(activeSchool._id) && msg.school?._id !== activeSchool._id) return;
      setMessages(prev => prev.find(m => m._id === msg._id) ? prev : [...prev, msg]);
      if (msg.sender?._id !== user._id) {
        setTimeout(() => API.put(`/messages/${msg._id}/read`).catch(() => {}), 800);
      }
    };
    const onTyping = ({ userId, isTyping }) => { if (userId !== user._id) setOtherTyping(isTyping); };

    socket.on('new_message', onNewMsg);
    socket.on('user_typing', onTyping);
    return () => { socket.off('new_message', onNewMsg); socket.off('user_typing', onTyping); };
  }, [socket, activeSchool, user]);

  // ── File selection ─────────────────────────────────────────────────────────
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError('');
    if (file.size > 15 * 1024 * 1024) {
      setFileError('File too large. Max size is 15MB.');
      return;
    }
    setPendingFile(file);
  };

  const clearPendingFile = () => {
    setPendingFile(null);
    setFileError('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleSend = async (e) => {
    e.preventDefault();
    const text = content.trim();
    const file = pendingFile;
    if ((!text && !file) || !activeSchool || sending) return;

    // Clear the input right away — don't make the user wait for the network
    // round trip before they can see/type their next message.
    setContent('');
    clearPendingFile();
    inputRef.current?.focus();

    setSending(true);
    try {
      const form = new FormData();
      form.append('schoolId', activeSchool._id);
      if (text) form.append('content', text);
      if (file) form.append('file', file);

      // Bounded timeout so a stalled connection can't leave the send button
      // stuck on "sending" forever.
      await API.post('/messages/send', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 20000,
      });
    } catch (e) {
      setFileError(e.response?.data?.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleTyping = (e) => {
    setContent(e.target.value);
    if (activeSchool) {
      sendTyping(activeSchool._id, true);
      clearTimeout(typingRef.current);
      typingRef.current = setTimeout(() => sendTyping(activeSchool._id, false), 1500);
    }
  };

  const filteredConvos = conversations.filter(c =>
    c.school.schoolName.toLowerCase().includes(search.toLowerCase())
  );

  const grouped = groupByDate(messages);

  return (
    <Layout>
      <div style={{ display: 'flex', height: 'calc(100vh - 130px)', background: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9', overflow: 'hidden' }}>

        {/* Conversation list */}
        <div style={{ width: '280px', borderRight: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ padding: '1rem', borderBottom: '1px solid #f1f5f9' }}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', fontWeight: '700', color: '#1e293b' }}>Conversations</h3>
            <input type="text" placeholder="Search schools..." value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.8rem', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8', fontSize: '0.82rem' }}>Loading...</div>
            ) : filteredConvos.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8', fontSize: '0.82rem' }}>
                {conversations.length === 0 ? 'No assigned schools yet' : 'No results found'}
              </div>
            ) : (
              filteredConvos.map(({ school, lastMessage, unreadCount }) => {
                const isActive = activeSchool?._id === school._id;
                return (
                  <div key={school._id} onClick={() => openConversation(school)}
                    style={{ padding: '0.875rem 1rem', cursor: 'pointer', background: isActive ? '#e8f0f9' : 'transparent', borderLeft: `3px solid ${isActive ? '#1e3a5f' : 'transparent'}`, transition: 'all 0.15s' }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#f8fafc'; }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                      <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#1e293b', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '0.5rem' }}>
                        {school.schoolName}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px', flexShrink: 0 }}>
                        {lastMessage && (
                          <span style={{ fontSize: '0.62rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                            {new Date(lastMessage.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                        {unreadCount > 0 && (
                          <span style={{ background: '#1e3a5f', color: '#fff', borderRadius: '10px', padding: '1px 6px', fontSize: '0.65rem', fontWeight: '700', minWidth: '18px', textAlign: 'center' }}>
                            {unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {lastMessage ? (lastMessage.content || `📎 ${lastMessage.attachment?.fileName || 'Attachment'}`) : 'No messages yet'}
                    </div>
                    <div style={{ marginTop: '4px' }}>
                      <StatusBadge status={school.currentStatus} size="sm" />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Chat window */}
        {!activeSchool ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', gap: '0.75rem' }}>
            <div style={{ fontSize: '3rem' }}>💬</div>
            <div style={{ fontWeight: '600', color: '#475569' }}>Select a conversation</div>
            <div style={{ fontSize: '0.82rem' }}>Choose a school from the left to start chatting</div>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

            <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '0.75rem', background: '#fafcff', flexShrink: 0 }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#e8f0f9', color: '#1e3a5f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', flexShrink: 0 }}>
                {activeSchool.schoolName[0]}
              </div>
              <div>
                <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#1e293b' }}>{activeSchool.schoolName}</div>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{messages.length} messages</div>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column' }}>
              {messages.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', gap: '0.5rem' }}>
                  <div style={{ fontSize: '2.5rem' }}>👋</div>
                  <div style={{ fontWeight: '600', color: '#475569' }}>Start the conversation</div>
                  <div style={{ fontSize: '0.82rem' }}>Send a message to {activeSchool.schoolName}</div>
                </div>
              ) : (
                Object.entries(grouped).map(([date, msgs]) => (
                  <div key={date}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '1rem 0 0.75rem' }}>
                      <div style={{ flex: 1, height: '1px', background: '#f1f5f9' }} />
                      <span style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: '600' }}>{date}</span>
                      <div style={{ flex: 1, height: '1px', background: '#f1f5f9' }} />
                    </div>
                    {msgs.map((msg) => {
                      const isMe = msg.sender?._id === user._id;
                      return (
                        <div key={msg._id} style={{ display: 'flex', flexDirection: isMe ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: '0.5rem', marginBottom: '0.375rem' }}>
                          {!isMe && (
                            <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#e8f5f1', color: '#1e5f4e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.68rem', fontWeight: '700', flexShrink: 0 }}>
                              {msg.sender?.name?.[0]?.toUpperCase()}
                            </div>
                          )}
                          <div style={{ maxWidth: '65%' }}>
                            {msg.attachment ? (
                              <AttachmentBubble msg={msg} isMe={isMe} />
                            ) : (
                              <div style={{ padding: '0.5rem 0.875rem', borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px', background: isMe ? '#1e3a5f' : '#f1f5f9', color: isMe ? '#fff' : '#1e293b', fontSize: '0.875rem', lineHeight: 1.5, wordBreak: 'break-word' }}>
                                {msg.content}
                              </div>
                            )}
                            <div style={{ display: 'flex', gap: '4px', justifyContent: isMe ? 'flex-end' : 'flex-start', marginTop: '2px' }}>
                              <span style={{ fontSize: '0.62rem', color: '#94a3b8' }}>{new Date(msg.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                              {isMe && <span style={{ fontSize: '0.65rem', color: msg.isRead ? '#22c55e' : '#94a3b8' }}>{msg.isRead ? '✓✓' : '✓'}</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}

              {otherTyping && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
                  <div style={{ display: 'flex', gap: '3px', padding: '0.5rem 0.875rem', background: '#f1f5f9', borderRadius: '16px 16px 16px 4px' }}>
                    {[0,1,2].map(i => <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#94a3b8', animation: `bounce 1s ${i*0.2}s infinite` }} />)}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div style={{ padding: '0.875rem 1.25rem', borderTop: '1px solid #f1f5f9', background: '#fafcff', flexShrink: 0 }}>

              {fileError && (
                <div style={{ marginBottom: '0.5rem', padding: '0.5rem 0.75rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '0.75rem', color: '#dc2626' }}>
                  ⚠ {fileError}
                </div>
              )}

              {pendingFile && (
                <div style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', background: '#f0f6ff', border: '1px solid #bfdbfe', borderRadius: '8px' }}>
                  <span style={{ fontSize: '1rem' }}>{PENDING_FILE_ICONS[getFileCategory(pendingFile.name)] || '📎'}</span>
                  <span style={{ flex: 1, fontSize: '0.78rem', fontWeight: '600', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pendingFile.name}</span>
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{(pendingFile.size / 1024).toFixed(0)} KB</span>
                  <button type="button" onClick={clearPendingFile} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '0.85rem' }}>✕</button>
                </div>
              )}

              <form onSubmit={handleSend} style={{ display: 'flex', gap: '0.625rem', alignItems: 'flex-end' }}>
                <input ref={fileRef} type="file" accept={ACCEPT_TYPES} onChange={handleFileSelect} style={{ display: 'none' }} />
                <button type="button" onClick={() => fileRef.current?.click()}
                  title="Attach image, PDF, Word, or Excel file"
                  style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#f1f5f9', border: 'none', cursor: 'pointer', fontSize: '1.1rem', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  📎
                </button>
                <textarea ref={inputRef} value={content} onChange={handleTyping}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); } }}
                  placeholder="Type a message..."
                  rows={1}
                  style={{ flex: 1, padding: '0.625rem 0.875rem', border: '1.5px solid #e2e8f0', borderRadius: '20px', fontSize: '0.875rem', fontFamily: 'inherit', outline: 'none', resize: 'none', maxHeight: '100px', overflowY: 'auto' }}
                />
                <button type="submit" disabled={(!content.trim() && !pendingFile) || sending}
                  style={{ width: '40px', height: '40px', borderRadius: '50%', background: (!content.trim() && !pendingFile) ? '#e2e8f0' : '#1e3a5f', border: 'none', cursor: (!content.trim() && !pendingFile) ? 'not-allowed' : 'pointer', fontSize: '1.1rem', flexShrink: 0 }}>
                  {sending ? '⏳' : '➤'}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
      <style>{`@keyframes bounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-4px)} }`}</style>
    </Layout>
  );
};

const groupByDate = (messages) => {
  const groups = {};
  messages.forEach(msg => {
    const d = new Date(msg.createdAt);
    const today = new Date();
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    let label = d.toDateString() === today.toDateString() ? 'Today' : d.toDateString() === yesterday.toDateString() ? 'Yesterday' : d.toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
    if (!groups[label]) groups[label] = [];
    groups[label].push(msg);
  });
  return groups;
};

export default AdminMessages;
