import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOrgId } from '@/hooks/useOrgId';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import { 
  CalendarIcon, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  Circle, 
  StickyNote, 
  CalendarDays, 
  CalendarCheck,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type TaskType = 'daily' | 'weekly' | 'note';

interface Task {
  id: string;
  organization_id: string;
  user_id: string;
  type: TaskType;
  content: string;
  is_completed: boolean;
  due_date: string | null;
  last_reset_at: string | null;
  created_at: string;
  updated_at: string;
}

export default function TasksPage() {
  const { organizationId } = useOrgId();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TaskType>('daily');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newDueDate, setNewDueDate] = useState<Date | undefined>();
  const [newType, setNewType] = useState<TaskType>('daily');

  // Reset daily tasks if it's a new day (client-side check)
  const resetDailyTasksMutation = useMutation({
    mutationFn: async () => {
      if (!organizationId) return;
      const today = format(new Date(), 'yyyy-MM-dd');
      const { error } = await supabase
        .from('tasks_and_notes')
        .update({ 
          is_completed: false, 
          last_reset_at: today,
          updated_at: new Date().toISOString() 
        })
        .eq('organization_id', organizationId)
        .eq('type', 'daily')
        .eq('is_completed', true)
        .lt('last_reset_at', today);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks-and-notes'] });
    },
  });

  // Fetch tasks
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks-and-notes', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      
      // First reset any daily tasks from previous days
      const today = format(new Date(), 'yyyy-MM-dd');
      await supabase
        .from('tasks_and_notes')
        .update({ 
          is_completed: false, 
          last_reset_at: today,
          updated_at: new Date().toISOString() 
        })
        .eq('organization_id', organizationId)
        .eq('type', 'daily')
        .eq('is_completed', true)
        .lt('last_reset_at', today);
      
      const { data, error } = await supabase
        .from('tasks_and_notes')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Task[];
    },
    enabled: !!organizationId,
  });

  // Create task
  const createMutation = useMutation({
    mutationFn: async (task: { type: TaskType; content: string; due_date?: string }) => {
      if (!organizationId || !user) throw new Error('Missing context');
      const { data, error } = await supabase
        .from('tasks_and_notes')
        .insert({
          organization_id: organizationId,
          user_id: user.id,
          type: task.type,
          content: task.content,
          due_date: task.due_date || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks-and-notes'] });
      setAddDialogOpen(false);
      setNewContent('');
      setNewDueDate(undefined);
      toast.success('Task added successfully');
    },
    onError: () => {
      toast.error('Failed to add task');
    },
  });

  // Toggle complete
  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_completed }: { id: string; is_completed: boolean }) => {
      const { error } = await supabase
        .from('tasks_and_notes')
        .update({ is_completed, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks-and-notes'] });
    },
  });

  // Delete task
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('tasks_and_notes')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks-and-notes'] });
      toast.success('Item deleted');
    },
    onError: () => {
      toast.error('Failed to delete item');
    },
  });

  const handleAddTask = () => {
    if (!newContent.trim()) {
      toast.error('Please enter content');
      return;
    }
    createMutation.mutate({
      type: newType,
      content: newContent.trim(),
      due_date: newDueDate ? format(newDueDate, 'yyyy-MM-dd') : undefined,
    });
  };

  const filteredTasks = tasks.filter(task => task.type === activeTab);
  const incompleteTasks = filteredTasks.filter(t => !t.is_completed);
  const completedTasks = filteredTasks.filter(t => t.is_completed);

  const getTabIcon = (type: TaskType) => {
    switch (type) {
      case 'daily': return <CalendarDays className="w-4 h-4" />;
      case 'weekly': return <CalendarCheck className="w-4 h-4" />;
      case 'note': return <StickyNote className="w-4 h-4" />;
    }
  };

  const getTabLabel = (type: TaskType) => {
    switch (type) {
      case 'daily': return 'Daily Tasks';
      case 'weekly': return 'Weekly Reminders';
      case 'note': return 'General Notes';
    }
  };

  return (
    <AdminLayout 
      title="Tasks & Notes" 
      subtitle="Manage your reminders, tasks, and notes"
      actions={
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Add New
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Item</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <div className="flex gap-2">
                  {(['daily', 'weekly', 'note'] as TaskType[]).map(type => (
                    <Button
                      key={type}
                      variant={newType === type ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setNewType(type)}
                      className="gap-2"
                    >
                      {getTabIcon(type)}
                      {type === 'daily' ? 'Daily' : type === 'weekly' ? 'Weekly' : 'Note'}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Content</Label>
                {newType === 'note' ? (
                  <Textarea
                    placeholder="Write your note..."
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    rows={4}
                  />
                ) : (
                  <Input
                    placeholder={newType === 'daily' ? 'What needs to be done today?' : 'Weekly reminder...'}
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                  />
                )}
              </div>

              {newType !== 'note' && (
                <div className="space-y-2">
                  <Label>Due Date (optional)</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !newDueDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {newDueDate ? format(newDueDate, 'PPP') : 'Pick a date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={newDueDate}
                        onSelect={setNewDueDate}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddTask} disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Add Item
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="space-y-6">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TaskType)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="daily" className="gap-2">
              <CalendarDays className="w-4 h-4" />
              <span className="hidden sm:inline">Daily Tasks</span>
              <span className="sm:hidden">Daily</span>
            </TabsTrigger>
            <TabsTrigger value="weekly" className="gap-2">
              <CalendarCheck className="w-4 h-4" />
              <span className="hidden sm:inline">Weekly Reminders</span>
              <span className="sm:hidden">Weekly</span>
            </TabsTrigger>
            <TabsTrigger value="note" className="gap-2">
              <StickyNote className="w-4 h-4" />
              <span className="hidden sm:inline">General Notes</span>
              <span className="sm:hidden">Notes</span>
            </TabsTrigger>
          </TabsList>

          {(['daily', 'weekly', 'note'] as TaskType[]).map(type => (
            <TabsContent key={type} value={type} className="mt-6">
              {isLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              ) : type === 'note' ? (
                // Notes view - sticky note style
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredTasks.length === 0 ? (
                    <Card className="col-span-full">
                      <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <StickyNote className="w-12 h-12 mb-4 opacity-50" />
                        <p>No notes yet</p>
                        <Button 
                          variant="link" 
                          onClick={() => { setNewType('note'); setAddDialogOpen(true); }}
                        >
                          Add your first note
                        </Button>
                      </CardContent>
                    </Card>
                  ) : (
                    filteredTasks.map(note => (
                      <Card key={note.id} className="bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start gap-2">
                            <p className="whitespace-pre-wrap text-sm flex-1">{note.content}</p>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                              onClick={() => deleteMutation.mutate(note.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground mt-3">
                            {format(new Date(note.created_at), 'MMM d, yyyy h:mm a')}
                          </p>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              ) : (
                // Tasks view - list style
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      {getTabIcon(type)}
                      {getTabLabel(type)}
                      <Badge variant="secondary" className="ml-auto">
                        {incompleteTasks.length} remaining
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="max-h-[calc(100vh-320px)] overflow-y-auto">
                    <div>
                      {filteredTasks.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                          <Circle className="w-12 h-12 mb-4 opacity-50" />
                          <p>No tasks yet</p>
                          <Button 
                            variant="link" 
                            onClick={() => { setNewType(type); setAddDialogOpen(true); }}
                          >
                            Add your first task
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {/* Incomplete tasks */}
                          {incompleteTasks.map(task => (
                            <div
                              key={task.id}
                              className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                            >
                              {/* Daily tasks only have delete, weekly tasks have checkbox */}
                              {type === 'weekly' ? (
                                <Checkbox
                                  checked={task.is_completed}
                                  onCheckedChange={(checked) => 
                                    toggleMutation.mutate({ id: task.id, is_completed: !!checked })
                                  }
                                />
                              ) : (
                                <Circle className="w-5 h-5 text-muted-foreground shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="truncate">{task.content}</p>
                                {task.due_date && (
                                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                    <CalendarIcon className="w-3 h-3" />
                                    {format(new Date(task.due_date), 'MMM d, yyyy')}
                                  </p>
                                )}
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                                onClick={() => deleteMutation.mutate(task.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          ))}
                          
                          {/* Completed tasks - only show for weekly tasks */}
                          {type === 'weekly' && completedTasks.length > 0 && (
                            <div className="mt-6">
                              <p className="text-sm font-medium text-muted-foreground mb-2">
                                Completed ({completedTasks.length})
                              </p>
                              {completedTasks.map(task => (
                                <div
                                  key={task.id}
                                  className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30 opacity-60"
                                >
                                  <Checkbox
                                    checked={task.is_completed}
                                    onCheckedChange={(checked) => 
                                      toggleMutation.mutate({ id: task.id, is_completed: !!checked })
                                    }
                                  />
                                  <div className="flex-1 min-w-0">
                                    <p className="truncate line-through">{task.content}</p>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                                    onClick={() => deleteMutation.mutate(task.id)}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </AdminLayout>
  );
}
