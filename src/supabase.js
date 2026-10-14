
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ebczttebbtqxztqyvlwu.supabase.co'
const supabaseKey = 'sb_publishable_-qp3zCZwaPDpxCH-djVMIw_URpNAhmu'

export const supabase = createClient(supabaseUrl, supabaseKey)
