import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import { useConversations, useMessages, useSendMessage, useMarkAsRead } from '../../../hooks/useMessages';
import { ThemedText, Card, Skeleton, EmptyState, Button, CardSkeleton } from '../../../components/ui';
import { Spacing, Radius, Typography, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

interface TeacherOption {
  staffId: string;
  fullName: string;
  role: string;
  studentId: string;
  studentName: string;
}

function useParentTeachers(parentId: string | null, schoolId: string) {
  return useQuery<TeacherOption[]>({
    queryKey: ['parent-teachers', parentId, schoolId],
    enabled: !!parentId && !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const db = supabase as any;
      // Get parent's children
      const { data: links } = await db
        .from('student_parent_links')
        .select('student_id, students(id, full_name, stream_id)')
        .eq('parent_id', parentId!)
        .eq('school_id', schoolId);
      if (!links?.length) return [];

      const children = links.map((l: any) => l.students).filter(Boolean);
      const streamIds = [...new Set(children.map((c: any) => c.stream_id).filter(Boolean))];
      if (!streamIds.length) return [];

      // Get HRTs for those streams
      const { data: hrtData } = await db
        .from('hrt_assignments')
        .select('staff_id, stream_id, staff(id, full_name)')
        .in('stream_id', streamIds)
        .eq('school_id', schoolId);

      // Get subject teachers for those streams
      const { data: stData } = await db
        .from('subject_teacher_assignments')
        .select('staff_id, stream_id, staff(id, full_name), subjects(name)')
        .in('stream_id', streamIds)
        .eq('school_id', schoolId);

      const teachers: TeacherOption[] = [];
      const seen = new Set<string>();

      for (const child of children) {
        for (const hrt of hrtData ?? []) {
          if (hrt.stream_id === child.stream_id && hrt.staff?.id) {
            const key = `${hrt.staff.id}-${child.id}`;
            if (!seen.has(key)) {
              seen.add(key);
              teachers.push({
                staffId: hrt.staff.id,
                fullName: hrt.staff.full_name,
                role: 'Homeroom Teacher',
                studentId: child.id,
                studentName: child.full_name,
              });
            }
          }
        }
        for (const st of stData ?? []) {
          if (st.stream_id === child.stream_id && st.staff?.id) {
            const key = `${st.staff.id}-${child.id}`;
            if (!seen.has(key)) {
              seen.add(key);
              teachers.push({
                staffId: st.staff.id,
                fullName: st.staff.full_name,
                role: st.subjects?.name ?? 'Subject Teacher',
                studentId: child.id,
                studentName: child.full_name,
              });
            }
          }
        }
      }
      return teachers;
    },
  });
}

export default function ParentMessages() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';
  const parentId = user?.parentId ?? null;

  const [activeConvo, setActiveConvo] = useState<any | null>(null);
  const [showCompose, setShowCompose] = useState(false);

  const { data: conversations, isLoading, refetch } = useConversations(schoolId, parentId, 'parent');
  const { data: teachers } = useParentTeachers(parentId, schoolId);
  const sendMessage = useSendMessage(schoolId);

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <ThemedText variant="h4">Messages</ThemedText>
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
        parentId={parentId!}
        convo={activeConvo}
        onBack={() => setActiveConvo(null)}
      />
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <ThemedText variant="h4">Messages</ThemedText>
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
          <TouchableOpacity
            onPress={() => {
              haptics.light();
              setActiveConvo(item);
            }}
          >
            <Card style={[styles.convoCard, item.unreadCount > 0 && styles.unreadCard]}>
              <View style={styles.convoHeader}>
                <ThemedText variant="body" style={{ fontWeight: '600' }}>
                  {item.otherPartyName}
                </ThemedText>
                {item.unreadCount > 0 && (
                  <View style={styles.badge}>
                    <ThemedText variant="caption" style={{ color: '#fff' }}>
                      {item.unreadCount}
                    </ThemedText>
                  </View>
                )}
              </View>
              {item.studentName && (
                <ThemedText variant="caption" color="secondary">
                  Re: {item.studentName}
                </ThemedText>
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
            description="Your conversations with teachers will appear here."
            icon="chatbubble-outline"
          />
        }
      />

      <Modal visible={showCompose} animationType="slide" transparent>
        <ComposeModal
          colors={colors}
          teachers={teachers ?? []}
          loading={sendMessage.isPending}
          onClose={() => setShowCompose(false)}
          onSend={async (teacher, body) => {
            try {
              await sendMessage.mutateAsync({
                senderId: parentId!,
                senderType: 'parent',
                recipientId: teacher.staffId,
                recipientType: 'staff',
                studentId: teacher.studentId,
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
  colors,
  teachers,
  loading,
  onClose,
  onSend,
}: {
  colors: any;
  teachers: TeacherOption[];
  loading: boolean;
  onClose: () => void;
  onSend: (teacher: TeacherOption, body: string) => void;
}) {
  const [selected, setSelected] = useState<TeacherOption | null>(null);
  const [body, setBody] = useState('');

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
          <ThemedText variant="bodySm" color="secondary" style={{ marginBottom: Spacing.sm }}>
            Select a teacher:
          </ThemedText>
          {teachers.length === 0 ? (
            <ThemedText variant="bodySm" color="secondary">No teachers found for your children.</ThemedText>
          ) : (
            teachers.map((t) => (
              <TouchableOpacity
                key={`${t.staffId}-${t.studentId}`}
                style={[
                  styles.teacherOption,
                  {
                    backgroundColor: selected?.staffId === t.staffId && selected?.studentId === t.studentId
                      ? colors.brand.primarySoft ?? colors.surfaceSecondary
                      : colors.surface,
                    borderColor: selected?.staffId === t.staffId && selected?.studentId === t.studentId
                      ? colors.brand.primary
                      : colors.border,
                  },
                ]}
                onPress={() => setSelected(t)}
              >
                <ThemedText variant="body" style={{ fontWeight: '600' }}>{t.fullName}</ThemedText>
                <ThemedText variant="caption" color="secondary">
                  {t.role} · Re: {t.studentName}
                </ThemedText>
              </TouchableOpacity>
            ))
          )}

          {selected && (
            <TextInput
              style={[
                styles.composeInput,
                { color: colors.textPrimary, borderColor: colors.border },
              ]}
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
              if (!selected) { Alert.alert('Validation', 'Please select a teacher'); return; }
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
  colors,
  schoolId,
  parentId,
  convo,
  onBack,
}: {
  colors: any;
  schoolId: string;
  parentId: string;
  convo: any;
  onBack: () => void;
}) {
  const [input, setInput] = useState('');
  const flatListRef = useRef<FlatList>(null);

  const { data: messages, isLoading } = useMessages(
    schoolId,
    parentId,
    convo.otherPartyId,
    convo.studentId
  );
  const sendMessage = useSendMessage(schoolId);
  const markAsRead = useMarkAsRead(schoolId);
  const markedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const unreadIds = messages
      ?.filter((m) => !m.is_read && m.recipient_id === parentId && !markedIdsRef.current.has(m.id))
      .map((m) => m.id);
    if (unreadIds?.length) {
      unreadIds.forEach((id) => markedIdsRef.current.add(id));
      markAsRead.mutate({ messageIds: unreadIds });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, parentId]);

  const handleSend = async () => {
    if (!input.trim()) return;
    try {
      await sendMessage.mutateAsync({
        senderId: parentId,
        senderType: 'parent',
        recipientId: convo.otherPartyId,
        recipientType: 'staff',
        studentId: convo.studentId,
        body: input,
      });
      setInput('');
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
          <ThemedText variant="body" style={{ fontWeight: '600' }}>
            {convo.otherPartyName}
          </ThemedText>
          {convo.studentName && (
            <ThemedText variant="caption" color="secondary">
              {convo.studentName}
            </ThemedText>
          )}
        </View>
      </View>

      {isLoading ? (
        <CardSkeleton lines={3} />
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages ?? []}
          contentContainerStyle={styles.chatList}
          keyExtractor={(m) => m.id}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => {
            const isMe = item.sender_id === parentId;
            return (
              <View style={[styles.messageBubble, isMe ? styles.myBubble : styles.theirBubble]}>
                <ThemedText variant="bodySm" style={isMe ? styles.myText : styles.theirText}>
                  {item.body}
                </ThemedText>
                <ThemedText variant="caption" style={styles.msgTime}>
                  {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </ThemedText>
              </View>
            );
          }}
        />
      )}

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
          <TouchableOpacity onPress={handleSend} disabled={!input.trim() || sendMessage.isPending}>
            <Ionicons
              name="send"
              size={24}
              color={input.trim() ? colors.brand.primary : colors.textMuted}
            />
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
  composeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    marginBottom: Spacing.md,
  },
  composeOverlay: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.base,
  },
  composeModal: {
    borderRadius: Radius.lg,
    maxHeight: '85%',
    overflow: 'hidden',
  },
  composeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  composeBody: {
    padding: Spacing.base,
  },
  composeFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
    padding: Spacing.base,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  teacherOption: {
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
});
