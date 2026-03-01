import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PatientRecord {
  patient_name: string
  patient_email?: string
  patient_phone?: string
  date_of_birth?: string
  gender?: string
  allergies?: string[]
  health_conditions?: string[]
  blood_type?: string
  medications?: { name: string; dosage?: string; frequency?: string }[]
  notes?: string
  tags?: string[]
}

interface ImportRequest {
  records: PatientRecord[]
  data_sharing_model: string
  import_source: string
  practice_id?: string
  send_invitations?: boolean
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Verify the user
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: authError } = await userClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Verify user is a clinician
    const adminClient = createClient(supabaseUrl, serviceRoleKey)
    const { data: clinicianProfile } = await adminClient
      .from('clinician_profiles')
      .select('id, patient_limit')
      .eq('user_id', user.id)
      .single()

    if (!clinicianProfile) {
      return new Response(JSON.stringify({ error: 'Not a clinician' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body: ImportRequest = await req.json()
    const { records, data_sharing_model, import_source, practice_id, send_invitations } = body

    if (!records || !Array.isArray(records) || records.length === 0) {
      return new Response(JSON.stringify({ error: 'No records provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (records.length > 500) {
      return new Response(JSON.stringify({ error: 'Maximum 500 records per import' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch existing records for dedup
    const { data: existingRecords } = await adminClient
      .from('clinician_patient_records')
      .select('patient_name, patient_email, patient_phone, date_of_birth')
      .eq('clinician_user_id', user.id)

    const existingSet = new Set(
      (existingRecords || []).map(r =>
        `${(r.patient_name || '').toLowerCase().trim()}|${(r.patient_email || '').toLowerCase().trim()}|${r.date_of_birth || ''}`
      )
    )

    let successCount = 0
    let duplicateCount = 0
    let errorCount = 0
    const errors: { row: number; error: string }[] = []

    // Process in batches of 100
    const batchSize = 100
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize)
      const toInsert: any[] = []

      for (let j = 0; j < batch.length; j++) {
        const record = batch[j]
        const rowIndex = i + j

        // Validate required fields
        if (!record.patient_name || record.patient_name.trim().length === 0) {
          errors.push({ row: rowIndex, error: 'Missing patient name' })
          errorCount++
          continue
        }

        // Check for duplicates
        const dedupKey = `${record.patient_name.toLowerCase().trim()}|${(record.patient_email || '').toLowerCase().trim()}|${record.date_of_birth || ''}`
        if (existingSet.has(dedupKey)) {
          duplicateCount++
          continue
        }
        existingSet.add(dedupKey)

        // Validate email format if provided
        if (record.patient_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.patient_email)) {
          errors.push({ row: rowIndex, error: 'Invalid email format' })
          errorCount++
          continue
        }

        toInsert.push({
          clinician_user_id: user.id,
          practice_id: practice_id || null,
          patient_name: record.patient_name.trim(),
          patient_email: record.patient_email?.trim() || null,
          patient_phone: record.patient_phone?.trim() || null,
          date_of_birth: record.date_of_birth || null,
          gender: record.gender || null,
          allergies: record.allergies || [],
          health_conditions: record.health_conditions || [],
          blood_type: record.blood_type || null,
          medications: record.medications || [],
          vitals_history: [],
          notes: record.notes || null,
          tags: record.tags || [],
          data_sharing_model: data_sharing_model || 'clinician_managed',
          import_source: import_source || 'csv',
          invitation_status: 'not_invited',
          clinician_data_consent_given_at: new Date().toISOString(),
        })
      }

      if (toInsert.length > 0) {
        const { error: insertError } = await adminClient
          .from('clinician_patient_records')
          .insert(toInsert)

        if (insertError) {
          console.error('Batch insert error:', insertError)
          errorCount += toInsert.length
          errors.push({ row: i, error: `Batch insert failed: ${insertError.message}` })
        } else {
          successCount += toInsert.length

          // Create data sharing agreements for each record
          // We need to fetch the inserted IDs
          if (data_sharing_model !== 'clinician_managed') {
            const { data: inserted } = await adminClient
              .from('clinician_patient_records')
              .select('id')
              .eq('clinician_user_id', user.id)
              .order('created_at', { ascending: false })
              .limit(toInsert.length)

            if (inserted) {
              const agreements = inserted.map(r => ({
                clinician_user_id: user.id,
                clinician_record_id: r.id,
                sharing_model: data_sharing_model,
                agreed_by: 'clinician',
                permissions: {
                  vitals_read: true,
                  vitals_write: data_sharing_model === 'collaborative',
                  meds_read: true,
                  meds_write: data_sharing_model === 'collaborative',
                  profile_read: true,
                  profile_write: false,
                  notes_read: false,
                },
              }))

              await adminClient.from('data_sharing_agreements').insert(agreements)
            }
          }
        }
      }
    }

    // Log the import action
    await adminClient.from('access_audit_logs').insert({
      actor_user_id: user.id,
      action: 'bulk_patient_import',
      resource_type: 'clinician_patient_records',
      metadata: {
        total_records: records.length,
        success_count: successCount,
        duplicate_count: duplicateCount,
        error_count: errorCount,
        import_source,
        data_sharing_model,
      },
    })

    return new Response(
      JSON.stringify({
        success: true,
        total: records.length,
        imported: successCount,
        duplicates: duplicateCount,
        errors: errorCount,
        error_details: errors.slice(0, 20),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('Import error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
