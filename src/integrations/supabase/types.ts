export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      applications: {
        Row: {
          ai_confidence: number | null
          ai_recommendation: string | null
          ai_summary: string | null
          bias_notes: Json | null
          candidate_id: string
          created_at: string
          id: string
          job_id: string
          job_version: number | null
          job_version_id: string | null
          manual_rank: number | null
          match_score: number | null
          matched_skills: string[]
          missing_skills: string[]
          score_breakdown: Json | null
          screened_at: string | null
          stage: string
          status: string
          updated_at: string
        }
        Insert: {
          ai_confidence?: number | null
          ai_recommendation?: string | null
          ai_summary?: string | null
          bias_notes?: Json | null
          candidate_id: string
          created_at?: string
          id?: string
          job_id: string
          job_version?: number | null
          job_version_id?: string | null
          manual_rank?: number | null
          match_score?: number | null
          matched_skills?: string[]
          missing_skills?: string[]
          score_breakdown?: Json | null
          screened_at?: string | null
          stage?: string
          status?: string
          updated_at?: string
        }
        Update: {
          ai_confidence?: number | null
          ai_recommendation?: string | null
          ai_summary?: string | null
          bias_notes?: Json | null
          candidate_id?: string
          created_at?: string
          id?: string
          job_id?: string
          job_version?: number | null
          job_version_id?: string | null
          manual_rank?: number | null
          match_score?: number | null
          matched_skills?: string[]
          missing_skills?: string[]
          score_breakdown?: Json | null
          screened_at?: string | null
          stage?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_job_version_id_fkey"
            columns: ["job_version_id"]
            isOneToOne: false
            referencedRelation: "job_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      approvals: {
        Row: {
          application_id: string | null
          comment: string | null
          created_at: string
          decided_by: string | null
          decision: string
          entity_id: string | null
          entity_type: string
          id: string
          new_value: Json | null
          previous_value: Json | null
        }
        Insert: {
          application_id?: string | null
          comment?: string | null
          created_at?: string
          decided_by?: string | null
          decision: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          new_value?: Json | null
          previous_value?: Json | null
        }
        Update: {
          application_id?: string | null
          comment?: string | null
          created_at?: string
          decided_by?: string | null
          decision?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          new_value?: Json | null
          previous_value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "approvals_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_id: string | null
          actor_type: string
          created_at: string
          details: Json
          entity_id: string | null
          entity_type: string
          id: string
          job_id: string | null
          model: string | null
          summary: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type: string
          id?: string
          job_id?: string | null
          model?: string | null
          summary?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type?: string
          id?: string
          job_id?: string | null
          model?: string | null
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_twins: {
        Row: {
          application_id: string | null
          burnout: Json
          candidate_id: string
          created_at: string
          created_by: string | null
          dna: Json
          id: string
          inputs: Json
          is_simulation: boolean
          job_id: string | null
          model: string
          overall_confidence: number
          predictions: Json
          promotion_path: Json
          recruiter_summary: string
          reliability: string
          retention: Json
          risk: Json
          salary: Json
          scenario: Json
          skill_evolution: Json
          team_chemistry: Json
          trajectory: Json
          version: number
        }
        Insert: {
          application_id?: string | null
          burnout?: Json
          candidate_id: string
          created_at?: string
          created_by?: string | null
          dna?: Json
          id?: string
          inputs?: Json
          is_simulation?: boolean
          job_id?: string | null
          model?: string
          overall_confidence?: number
          predictions?: Json
          promotion_path?: Json
          recruiter_summary?: string
          reliability?: string
          retention?: Json
          risk?: Json
          salary?: Json
          scenario?: Json
          skill_evolution?: Json
          team_chemistry?: Json
          trajectory?: Json
          version?: number
        }
        Update: {
          application_id?: string | null
          burnout?: Json
          candidate_id?: string
          created_at?: string
          created_by?: string | null
          dna?: Json
          id?: string
          inputs?: Json
          is_simulation?: boolean
          job_id?: string | null
          model?: string
          overall_confidence?: number
          predictions?: Json
          promotion_path?: Json
          recruiter_summary?: string
          reliability?: string
          retention?: Json
          risk?: Json
          salary?: Json
          scenario?: Json
          skill_evolution?: Json
          team_chemistry?: Json
          trajectory?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "candidate_twins_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_twins_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_twins_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      candidates: {
        Row: {
          created_at: string
          created_by: string | null
          dedupe_key: string | null
          education: Json
          email: string | null
          embedding: Json | null
          full_name: string
          headline: string | null
          id: string
          links: Json
          location: string | null
          ocr_used: boolean
          phone: string | null
          resume_file_name: string | null
          resume_storage_path: string | null
          resume_text: string
          skills: string[]
          source: string
          updated_at: string
          work_history: Json
          years_experience: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dedupe_key?: string | null
          education?: Json
          email?: string | null
          embedding?: Json | null
          full_name: string
          headline?: string | null
          id?: string
          links?: Json
          location?: string | null
          ocr_used?: boolean
          phone?: string | null
          resume_file_name?: string | null
          resume_storage_path?: string | null
          resume_text?: string
          skills?: string[]
          source?: string
          updated_at?: string
          work_history?: Json
          years_experience?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dedupe_key?: string | null
          education?: Json
          email?: string | null
          embedding?: Json | null
          full_name?: string
          headline?: string | null
          id?: string
          links?: Json
          location?: string | null
          ocr_used?: boolean
          phone?: string | null
          resume_file_name?: string | null
          resume_storage_path?: string | null
          resume_text?: string
          skills?: string[]
          source?: string
          updated_at?: string
          work_history?: Json
          years_experience?: number
        }
        Relationships: []
      }
      copilot_favorites: {
        Row: {
          candidate_id: string
          created_at: string
          id: string
          note: string
          user_id: string
        }
        Insert: {
          candidate_id: string
          created_at?: string
          id?: string
          note?: string
          user_id: string
        }
        Update: {
          candidate_id?: string
          created_at?: string
          id?: string
          note?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "copilot_favorites_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot_memory: {
        Row: {
          created_at: string
          id: string
          key: string
          updated_at: string
          user_id: string
          value: Json
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          user_id: string
          value?: Json
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          user_id?: string
          value?: Json
        }
        Relationships: []
      }
      copilot_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      copilot_reports: {
        Row: {
          created_at: string
          id: string
          job_id: string | null
          model: string | null
          payload: Json
          status: string
          thread_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id?: string | null
          model?: string | null
          payload?: Json
          status?: string
          thread_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string | null
          model?: string | null
          payload?: Json
          status?: string
          thread_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "copilot_reports_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copilot_reports_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "copilot_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot_saved_queries: {
        Row: {
          created_at: string
          id: string
          kind: string
          label: string
          query: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          label: string
          query: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          label?: string
          query?: string
          user_id?: string
        }
        Relationships: []
      }
      copilot_threads: {
        Row: {
          campaign: string | null
          created_at: string
          id: string
          last_message_at: string
          pinned: boolean
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          campaign?: string | null
          created_at?: string
          id?: string
          last_message_at?: string
          pinned?: boolean
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          campaign?: string | null
          created_at?: string
          id?: string
          last_message_at?: string
          pinned?: boolean
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      copilot_turns: {
        Row: {
          actions: Json
          agents: Json
          confidence: number | null
          content: string
          created_at: string
          decision_path: Json
          evidence: Json
          follow_ups: Json
          id: string
          latency_ms: number | null
          model: string | null
          model_version: string
          reasoning: Json
          role: string
          supporting_data: Json
          thread_id: string
          user_id: string
        }
        Insert: {
          actions?: Json
          agents?: Json
          confidence?: number | null
          content?: string
          created_at?: string
          decision_path?: Json
          evidence?: Json
          follow_ups?: Json
          id?: string
          latency_ms?: number | null
          model?: string | null
          model_version?: string
          reasoning?: Json
          role: string
          supporting_data?: Json
          thread_id: string
          user_id: string
        }
        Update: {
          actions?: Json
          agents?: Json
          confidence?: number | null
          content?: string
          created_at?: string
          decision_path?: Json
          evidence?: Json
          follow_ups?: Json
          id?: string
          latency_ms?: number | null
          model?: string | null
          model_version?: string
          reasoning?: Json
          role?: string
          supporting_data?: Json
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "copilot_turns_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "copilot_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      debate_messages: {
        Row: {
          agents: Json
          confidence: number | null
          content: string
          created_at: string
          created_by: string | null
          debate_id: string
          evidence: Json
          id: string
          model: string | null
          role: string
        }
        Insert: {
          agents?: Json
          confidence?: number | null
          content: string
          created_at?: string
          created_by?: string | null
          debate_id: string
          evidence?: Json
          id?: string
          model?: string | null
          role: string
        }
        Update: {
          agents?: Json
          confidence?: number | null
          content?: string
          created_at?: string
          created_by?: string | null
          debate_id?: string
          evidence?: Json
          id?: string
          model?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "debate_messages_debate_id_fkey"
            columns: ["debate_id"]
            isOneToOne: false
            referencedRelation: "debates"
            referencedColumns: ["id"]
          },
        ]
      }
      debates: {
        Row: {
          application_ids: string[]
          candidate_ids: string[]
          candidates: Json
          confidence: number
          conflicts: Json
          consensus: number
          created_at: string
          created_by: string | null
          decided_at: string | null
          decided_by: string | null
          evidence: Json
          final: Json
          graph: Json
          human_comment: string | null
          human_decision: string | null
          human_override: boolean
          id: string
          is_simulation: boolean
          job_id: string | null
          job_version: number | null
          latency_ms: number
          mode: string
          model: string | null
          model_version: string
          opinions: Json
          parent_debate_id: string | null
          recommendation: string | null
          rounds: Json
          scenario: Json
          status: string
          timeline: Json
          title: string
          updated_at: string
          votes: Json
        }
        Insert: {
          application_ids?: string[]
          candidate_ids?: string[]
          candidates?: Json
          confidence?: number
          conflicts?: Json
          consensus?: number
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          evidence?: Json
          final?: Json
          graph?: Json
          human_comment?: string | null
          human_decision?: string | null
          human_override?: boolean
          id?: string
          is_simulation?: boolean
          job_id?: string | null
          job_version?: number | null
          latency_ms?: number
          mode?: string
          model?: string | null
          model_version?: string
          opinions?: Json
          parent_debate_id?: string | null
          recommendation?: string | null
          rounds?: Json
          scenario?: Json
          status?: string
          timeline?: Json
          title?: string
          updated_at?: string
          votes?: Json
        }
        Update: {
          application_ids?: string[]
          candidate_ids?: string[]
          candidates?: Json
          confidence?: number
          conflicts?: Json
          consensus?: number
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          evidence?: Json
          final?: Json
          graph?: Json
          human_comment?: string | null
          human_decision?: string | null
          human_override?: boolean
          id?: string
          is_simulation?: boolean
          job_id?: string | null
          job_version?: number | null
          latency_ms?: number
          mode?: string
          model?: string | null
          model_version?: string
          opinions?: Json
          parent_debate_id?: string | null
          recommendation?: string | null
          rounds?: Json
          scenario?: Json
          status?: string
          timeline?: Json
          title?: string
          updated_at?: string
          votes?: Json
        }
        Relationships: [
          {
            foreignKeyName: "debates_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debates_parent_debate_id_fkey"
            columns: ["parent_debate_id"]
            isOneToOne: false
            referencedRelation: "debates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_default: boolean
          kind: string
          name: string
          subject: string
          updated_at: string
        }
        Insert: {
          body?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          kind?: string
          name: string
          subject?: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          kind?: string
          name?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      emails: {
        Row: {
          application_id: string | null
          approved_at: string | null
          approved_by: string | null
          body: string
          created_at: string
          created_by: string | null
          delivery_note: string | null
          id: string
          kind: string
          sent_at: string | null
          status: string
          subject: string
          template_id: string | null
          template_name: string | null
          to_email: string | null
          updated_at: string
          variables: Json
        }
        Insert: {
          application_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          body?: string
          created_at?: string
          created_by?: string | null
          delivery_note?: string | null
          id?: string
          kind?: string
          sent_at?: string | null
          status?: string
          subject?: string
          template_id?: string | null
          template_name?: string | null
          to_email?: string | null
          updated_at?: string
          variables?: Json
        }
        Update: {
          application_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          body?: string
          created_at?: string
          created_by?: string | null
          delivery_note?: string | null
          id?: string
          kind?: string
          sent_at?: string | null
          status?: string
          subject?: string
          template_id?: string | null
          template_name?: string | null
          to_email?: string | null
          updated_at?: string
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "emails_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_notes: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          session_id: string
          turn_index: number | null
        }
        Insert: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          session_id: string
          turn_index?: number | null
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          session_id?: string
          turn_index?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "interview_notes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "interview_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_sessions: {
        Row: {
          application_id: string | null
          candidate_id: string
          coach: Json
          company_type: string
          consistency: Json
          created_at: string
          created_by: string | null
          device_check: Json
          difficulty: string
          duration_seconds: number
          ended_at: string | null
          heatmap: Json
          id: string
          interview_id: string | null
          job_id: string | null
          job_version: number | null
          live_scores: Json
          model: string | null
          model_version: string
          overall_score: number | null
          planned_questions: number
          recommendation: string | null
          recommendation_confidence: number | null
          round_number: number
          round_type: string
          signal_summary: Json
          started_at: string | null
          status: string
          summary: Json
          updated_at: string
        }
        Insert: {
          application_id?: string | null
          candidate_id: string
          coach?: Json
          company_type?: string
          consistency?: Json
          created_at?: string
          created_by?: string | null
          device_check?: Json
          difficulty?: string
          duration_seconds?: number
          ended_at?: string | null
          heatmap?: Json
          id?: string
          interview_id?: string | null
          job_id?: string | null
          job_version?: number | null
          live_scores?: Json
          model?: string | null
          model_version?: string
          overall_score?: number | null
          planned_questions?: number
          recommendation?: string | null
          recommendation_confidence?: number | null
          round_number?: number
          round_type?: string
          signal_summary?: Json
          started_at?: string | null
          status?: string
          summary?: Json
          updated_at?: string
        }
        Update: {
          application_id?: string | null
          candidate_id?: string
          coach?: Json
          company_type?: string
          consistency?: Json
          created_at?: string
          created_by?: string | null
          device_check?: Json
          difficulty?: string
          duration_seconds?: number
          ended_at?: string | null
          heatmap?: Json
          id?: string
          interview_id?: string | null
          job_id?: string | null
          job_version?: number | null
          live_scores?: Json
          model?: string | null
          model_version?: string
          overall_score?: number | null
          planned_questions?: number
          recommendation?: string | null
          recommendation_confidence?: number | null
          round_number?: number
          round_type?: string
          signal_summary?: Json
          started_at?: string | null
          status?: string
          summary?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_sessions_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_sessions_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_sessions_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_sessions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_signals: {
        Row: {
          body: Json
          created_at: string
          emotion: Json
          face: Json
          id: string
          notes: string
          offset_ms: number
          session_id: string
          source: string
          turn_index: number
          voice: Json
        }
        Insert: {
          body?: Json
          created_at?: string
          emotion?: Json
          face?: Json
          id?: string
          notes?: string
          offset_ms?: number
          session_id: string
          source?: string
          turn_index?: number
          voice?: Json
        }
        Update: {
          body?: Json
          created_at?: string
          emotion?: Json
          face?: Json
          id?: string
          notes?: string
          offset_ms?: number
          session_id?: string
          source?: string
          turn_index?: number
          voice?: Json
        }
        Relationships: [
          {
            foreignKeyName: "interview_signals_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "interview_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_turns: {
        Row: {
          answer_seconds: number
          answer_transcript: string
          answered_at: string | null
          code_submission: string | null
          competency: string | null
          confidence: number | null
          created_at: string
          evaluation: Json
          evidence: Json
          expected_signals: Json
          id: string
          is_follow_up: boolean
          keywords: Json
          kind: string
          live_feedback: Json
          offset_ms: number
          question: string
          question_rationale: string
          scores: Json
          session_id: string
          turn_index: number
        }
        Insert: {
          answer_seconds?: number
          answer_transcript?: string
          answered_at?: string | null
          code_submission?: string | null
          competency?: string | null
          confidence?: number | null
          created_at?: string
          evaluation?: Json
          evidence?: Json
          expected_signals?: Json
          id?: string
          is_follow_up?: boolean
          keywords?: Json
          kind?: string
          live_feedback?: Json
          offset_ms?: number
          question?: string
          question_rationale?: string
          scores?: Json
          session_id: string
          turn_index: number
        }
        Update: {
          answer_seconds?: number
          answer_transcript?: string
          answered_at?: string | null
          code_submission?: string | null
          competency?: string | null
          confidence?: number | null
          created_at?: string
          evaluation?: Json
          evidence?: Json
          expected_signals?: Json
          id?: string
          is_follow_up?: boolean
          keywords?: Json
          kind?: string
          live_feedback?: Json
          offset_ms?: number
          question?: string
          question_rationale?: string
          scores?: Json
          session_id?: string
          turn_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "interview_turns_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "interview_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      interviews: {
        Row: {
          application_id: string
          created_at: string
          created_by: string | null
          duration_minutes: number
          feedback_notes: string | null
          feedback_rating: number | null
          feedback_summary: string | null
          id: string
          interviewer_name: string | null
          meeting_link: string | null
          questions: Json
          round_name: string
          round_number: number
          scheduled_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          application_id: string
          created_at?: string
          created_by?: string | null
          duration_minutes?: number
          feedback_notes?: string | null
          feedback_rating?: number | null
          feedback_summary?: string | null
          id?: string
          interviewer_name?: string | null
          meeting_link?: string | null
          questions?: Json
          round_name?: string
          round_number?: number
          scheduled_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          application_id?: string
          created_at?: string
          created_by?: string | null
          duration_minutes?: number
          feedback_notes?: string | null
          feedback_rating?: number | null
          feedback_summary?: string | null
          id?: string
          interviewer_name?: string | null
          meeting_link?: string | null
          questions?: Json
          round_name?: string
          round_number?: number
          scheduled_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interviews_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          accepted_user_id: string | null
          created_at: string
          email: string
          id: string
          invited_by: string | null
          note: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          email: string
          id?: string
          invited_by?: string | null
          note?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
          note?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      job_versions: {
        Row: {
          change_summary: string
          created_at: string
          created_by: string | null
          department: string | null
          description: string
          employment_type: string | null
          id: string
          interview_rounds: number
          job_id: string
          location: string | null
          min_experience_years: number
          nice_to_have_skills: string[]
          required_skills: string[]
          salary_max: number | null
          salary_min: number | null
          seniority: string | null
          title: string
          version: number
        }
        Insert: {
          change_summary?: string
          created_at?: string
          created_by?: string | null
          department?: string | null
          description?: string
          employment_type?: string | null
          id?: string
          interview_rounds?: number
          job_id: string
          location?: string | null
          min_experience_years?: number
          nice_to_have_skills?: string[]
          required_skills?: string[]
          salary_max?: number | null
          salary_min?: number | null
          seniority?: string | null
          title: string
          version: number
        }
        Update: {
          change_summary?: string
          created_at?: string
          created_by?: string | null
          department?: string | null
          description?: string
          employment_type?: string | null
          id?: string
          interview_rounds?: number
          job_id?: string
          location?: string | null
          min_experience_years?: number
          nice_to_have_skills?: string[]
          required_skills?: string[]
          salary_max?: number | null
          salary_min?: number | null
          seniority?: string | null
          title?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_versions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          created_at: string
          created_by: string | null
          current_version: number
          department: string | null
          description: string
          employment_type: string
          id: string
          interview_rounds: number
          location: string | null
          min_experience_years: number
          nice_to_have_skills: string[]
          required_skills: string[]
          salary_max: number | null
          salary_min: number | null
          seniority: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_version?: number
          department?: string | null
          description?: string
          employment_type?: string
          id?: string
          interview_rounds?: number
          location?: string | null
          min_experience_years?: number
          nice_to_have_skills?: string[]
          required_skills?: string[]
          salary_max?: number | null
          salary_min?: number | null
          seniority?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_version?: number
          department?: string | null
          description?: string
          employment_type?: string
          id?: string
          interview_rounds?: number
          location?: string | null
          min_experience_years?: number
          nice_to_have_skills?: string[]
          required_skills?: string[]
          salary_max?: number | null
          salary_min?: number | null
          seniority?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      offer_approvals: {
        Row: {
          comment: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision: string
          id: string
          level: number
          level_name: string
          offer_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision?: string
          id?: string
          level: number
          level_name?: string
          offer_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision?: string
          id?: string
          level?: number
          level_name?: string
          offer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "offer_approvals_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          application_id: string
          created_at: string
          created_by: string | null
          currency: string
          current_level: number
          equity: string | null
          id: string
          notes: string | null
          salary: number | null
          start_date: string | null
          status: string
          total_levels: number
          updated_at: string
        }
        Insert: {
          application_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          current_level?: number
          equity?: string | null
          id?: string
          notes?: string | null
          salary?: number | null
          start_date?: string | null
          status?: string
          total_levels?: number
          updated_at?: string
        }
        Update: {
          application_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          current_level?: number
          equity?: string | null
          id?: string
          notes?: string | null
          salary?: number | null
          start_date?: string | null
          status?: string
          total_levels?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offers_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_write: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "recruiter" | "hiring_manager" | "viewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "recruiter", "hiring_manager", "viewer"],
    },
  },
} as const
