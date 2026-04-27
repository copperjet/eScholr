import React, { useState, useRef, useEffect } from 'react';
import {
  View, StyleSheet, SafeAreaView, FlatList, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, Alert, Modal, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import { useConversations, useMessages, useSendMessage, useMarkAsRead, Conversation } from '../../../hooks/useMessages';
import { ThemedText, Card, EmptyState, Button, CardSkeleton } from '../../../components/ui';
import { Spacing, Radius, Typography, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

interface ParentOption {
  parentId: string;
  parentName: string;
  studentId: string;
  studentName: string;
}

function useSubjectTeacherParents(staffId: string | null, schoolId: string) {
  return useQuery<ParentOption[]>({
    queryKey: ['st-parents', staffId, schoolId],
    enabled: !!staffId && !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const db = supabase as any;
      // Get teacher's streams via subject_teacher_assignments
      const { data: assignments } = await db
        .from('subject_teacher_assignments')
        .select('stream_id')
        .eq('staff_id', staffId!)
        .eq('school_id', schoolId);
      const streamIds = [...new Set((assignments ?? []).map((a: any) => a.stream_id))];
      if (!streamIds.length) return [];

      // Get students in those streams
      const { data: students } = await db
        .from('students')
        .select('id, full_name, stream_id')
        .in('stream_id', streamIds)
        .eq('school_id', schoolId)
        .eq('status', 'active');

      if (!students?.length) return [];
      const studentIds = students.map((s: any) => s.id);

      // Get parent links
      const { data: links } = await db
        .from('student_parent_links')
        .select('student_id, parent_id, parents(id, full_name)')
        .in('student_id', studentIds)
        .eq('school_id', schoolId);

      const results: ParentOption[] = [];
      const seen = new Set<string>();
      for (const link of links ?? []) {
        if (!link.parents?.id) continue;
        const student = students.find((s: any) => s.id === link.student_id);
        const key = `${link.parents.id}-${link.student_id}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push({
            parentId: link.parents.id,
            parentName: link.parents.full_name,
            studentId: link.student_id,
            studentName: student?.full_name ?? 'Unknown',
          });
        }
      }
      return results.sort((a, b) => a.studentName.localeCompare(b.studentName));
    },
  });
}

export default function STMessages() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';
  const staffId = user?.staffId ?? null;

  const [activeConvo, setActiveConvo] = useState<Conversation | null>(null);
  const [showCompose, setShowCompose] = useState(false);

  const { data: conversations, isLoading, refetch } = useConversations(schoolId, staffId, 'staff');
  const { data: parents } = useSubjectTeacherParents(staffId, schoolId);
  const sendMessage = useSendMessage(schoolId);

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <ThemedText variant="h4">Parent Messages</ThemedText>
        </View>
        <CardSkeleton lines={2} />
        <CardSkeleton lines={2} />
        <CardSkeleton lines={2} />
      </SafeAreaView>
    );
  }

  if (activeConvo) {
    return (
      <ChatScreen
        colors={colors}
        schoolId={schoolId}
        staffId={staffId!}
        convo={activeConvo}
        onBack={() => setActiveConvo(null)}
      />
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <ThemedText variant="h4">Parent Messages</ThemedText>
      </View>

      <FlatList
        data={conversations ?? []}
        contentContainerStyle={styles.list}
        keyExtractor={(item) => `${item.otherPartyId}-${item.studentId || 'none'}`}
        onRefresh={refetch}
        refreshing={isLoading}
        ListHeaderComponent={
          <TouchableOpacity
            style={[styles.composeBtn, { backgroundColor: colors.brand.primary }]}
            onPress={() => { haptics.light(); setShowCompose(true); }}
          >
            <Ionicons name="create-outline" size={18} color="#fff" />
            <ThemedText variant="bodySm" style={{ color: '#fff', marginLeft: Spacing.sm }}>
              New Message
            </ThemedText>
          </TouchableOpacity>
        }
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => { haptics.light(); setActiveConvo(item); }}>
            <Card style={[styles.convoCard, item.unreadCount > 0 && styles.unreadCard]}>
              <View style={styles.convoHeader}>
                <ThemedText variant="body" style={{ fontWeight: '600' }}>
                  {item.otherPartyName}
                </ThemedText>
                {item.unreadCount > 0 && (
                  <View style={styles.badge}>
                    <ThemedText variant="caption" style={{ color: '#fff' }}>{item.unreadCount}</ThemedText>
                  </View>
                )}
              </View>
              {item.studentName && (
                <ThemedText variant="caption" color="secondary">Re: {item.studentName}</ThemedText>
              )}
              <ThemedText variant="bodySm" color="secondary" numberOfLines={1} style={styles.lastMsg}>
                {item.lastMessage.body}
              </ThemedText>
              <ThemedText variant="caption" color="secondary" style={styles.time}>
                {new Date(item.lastMessage.created_at).toLocaleDateString()}
              </ThemedText>
            </Card>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <EmptyState
            title="No messages"
            description="Your conversations with parents will appear here."
            icon="chatbubble-outline"
          />
        }
      />

      <Modal visible={showCompose} animationType="slide" transparent>
        <ComposeModal
          colors={colors}
          parents={parents ?? []}
          loading={sendMessage.isPending}
          onClose={() => setShowCompose(false)}
          onSend={async (parent, body) => {
            try {
              await sendMessage.mutateAsync({
                senderId: staffId!,
                senderType: 'staff',
                recipientId: parent.parentId,
                recipientType: 'parent',
                studentId: parent.studentId,
                body,
              });
              setShowCompose(false);
              refetch();
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed to send');
            }
          }}
        />
      </Modal>
    </SafeAreaView>
  );
}

function ComposeModal({
  colors, parents, loading, onClose, onSend,
}: {
  colors: any;
  parents: ParentOption[];
  loading: boolean;
  onClose: () => void;
  onSend: (parent: ParentOption, body: string) => void;
}) {
  const [selected, setSelected] = useState<ParentOption | null>(null);
  const [body, setBody] = useState('');
  const [search, setSearch] = useState('');

  const filtered = parents.filter(
    (p) =>
      p.parentName.toLowerCase().includes(search.toLowerCase()) ||
      p.studentName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={[styles.composeOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.composeModal, { backgroundColor: colors.background }]}
      >
        <View style={styles.composeHeader}>
          <ThemedText variant="h4">New Message</ThemedText>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.composeBody}>
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
            placeholder="Search parents or students..."
            placeholderTextColor={colors.textSecondary}
            value={search}
            onChangeText={setSearch}
          />

          <ThemedText variant="bodySm" color="secondary" style={{ marginBottom: Spacing.sm }}>
            Select a parent:
          </ThemedText>
          {filtered.length === 0 ? (
            <ThemedText variant="bodySm" color="secondary">No parents found.</ThemedText>
          ) : (
            filtered.slice(0, 20).map((p) => (
              <TouchableOpacity
                key={`${p.parentId}-${p.studentId}`}
                style={[
                  styles.parentOption,
                  {
                    backgroundColor: selected?.parentId === p.parentId && selected?.studentId === p.studentId
                      ? colors.brand.primarySoft ?? colors.surfaceSecondary
                      : colors.surface,
                    borderColor: selected?.parentId === p.parentId && selected?.studentId === p.studentId
                      ? colors.brand.primary
                      : colors.border,
                  },
                ]}
                onPress={() => setSelected(p)}
              >
                <ThemedText variant="body" style={{ fontWeight: '600' }}>{p.parentName}</ThemedText>
                <ThemedText variant="caption" color="secondary">Parent of {p.studentName}</ThemedText>
              </TouchableOpacity>
            ))
          )}

          {selected && (
            <TextInput
              style={[styles.composeInput, { color: colors.textPrimary, borderColor: colors.border }]}
              placeholder="Type your message..."
              placeholderTextColor={colors.textSecondary}
              value={body}
              onChangeText={setBody}
              multiline
            />
          )}
        </ScrollView>

        <View style={styles.composeFooter}>
          <Button label="Cancel" variant="ghost" onPress={onClose} />
          <Button
            label="Send"
            loading={loading}
            onPress={() => {
              if (!selected) { Alert.alert('Validation', 'Please select a parent'); return; }
              if (!body.trim()) { Alert.alert('Validation', 'Please enter a message'); return; }
              onSend(selected, body);
            }}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function ChatScreen({
  colors, schoolId, staffId, convo, onBack,
}: {
  colors: any;
  schoolId: string;
  staffId: string;
  convo: Conversation;
  onBack: () => void;
}) {
  const [input, setInput] = useState('');
  const flatListRef = useRef<FlatList>(null);
  const markedIdsRef = useRef<Set<string>>(new Set());

  const { data: messages, isLoading } = useMessages(schoolId, staffId, convo.otherPartyId, convo.studentId);
  const sendMessage = useSendMessage(schoolId);
  const markAsRead = useMarkAsRead(schoolId);

  useEffect(() => {
    const unreadIds = messages
      ?.filter((m) => !m.is_read && m.recipient_id === staffId && !markedIdsRef.current.has(m.id))
      .map((m) => m.id);
    if (unreadIds?.length) {
      unreadIds.forEach((id) => markedIdsRef.current.add(id));
      markAsRead.mutate({ messageIds: unreadIds });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, staffId]);

  const handleSend = async () => {
    if (!input.trim()) return;
    try {
      await sendMessage.mutateAsync({
        senderId: staffId,
        senderType: 'staff',
        recipientId: convo.otherPartyId,
        recipientType: convo.otherPartyType,
        studentId: convo.studentId,
        body: input.trim(),
      });
      setInput('');
      setTimeout(() => flatListRef.current?.scrollToEnd(), 200);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to send');
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.chatHeader}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <ThemedText variant="body" style={{ fontWeight: '600' }}>{convo.otherPartyName}</ThemedText>
          {convo.studentName && (
            <ThemedText variant="caption" color="secondary">Re: {convo.studentName}</ThemedText>
          )}
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages ?? []}
        contentContainerStyle={styles.chatList}
        keyExtractor={(m) => m.id}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) => {
          const isMine = item.sender_id === staffId;
          return (
            <View style={[styles.messageBubble, isMine ? styles.myBubble : styles.theirBubble]}>
              <ThemedText variant="bodySm" style={isMine ? styles.myText : styles.theirText}>
                {item.body}
              </ThemedText>
              <ThemedText variant="caption" style={[styles.msgTime, isMine ? styles.myText : styles.theirText]}>
                {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </ThemedText>
            </View>
          );
        }}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={80}
      >
        <View style={[styles.inputBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TextInput
            style={[styles.input, { color: colors.textPrimary }]}
            placeholder="Type a message..."
            placeholderTextColor={colors.textSecondary}
            value={input}
            onChangeText={setInput}
            multiline
          />
          <TouchableOpacity onPress={handleSend}>
            <Ionicons name="send" size={24} color={input.trim() ? colors.brand.primary : colors.textMuted} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  list: { padding: Spacing.base, paddingBottom: TAB_BAR_HEIGHT },
  convoCard: { marginBottom: Spacing.md },
  unreadCard: { borderLeftWidth: 3, borderLeftColor: Colors.semantic.info },
  convoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badge: {
    backgroundColor: Colors.semantic.info,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
  },
  lastMsg: { marginTop: Spacing.xs },
  time: { marginTop: Spacing.sm },
  composeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    marginBottom: Spacing.md,
  },
  composeOverlay: { flex: 1, justifyContent: 'center', padding: Spacing.base },
  composeModal: { borderRadius: Radius.lg, maxHeight: '85%', overflow: 'hidden' },
  composeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  composeBody: { padding: Spacing.base },
  composeFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
    padding: Spacing.base,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    fontSize: Typography.body.fontSize,
  },
  parentOption: {
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    marginBottom: Spacing.sm,
  },
  composeInput: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
    minHeight: 100,
    textAlignVertical: 'top',
    fontSize: Typography.body.fontSize,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backBtn: { marginRight: Spacing.sm },
  chatList: { padding: Spacing.base, paddingBottom: 20 },
  messageBubble: {
    maxWidth: '80%',
    padding: Spacing.md,
    borderRadius: Radius.lg,
    marginBottom: Spacing.md,
  },
  myBubble: {
    alignSelf: 'flex-end',
    backgroundColor: Colors.semantic.info,
    borderBottomRightRadius: Radius.sm,
  },
  theirBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#f0f0f0',
    borderBottomLeftRadius: Radius.sm,
  },
  myText: { color: '#fff' },
  theirText: { color: '#333' },
  msgTime: { marginTop: Spacing.xs, opacity: 0.7 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    maxHeight: 100,
    paddingHorizontal: Spacing.md,
    fontSize: Typography.body.fontSize,
  },
});
