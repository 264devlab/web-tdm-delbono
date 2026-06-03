import { createClient } from '@supabase/supabase-js';

// Load Supabase environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

// Define mock data store structure in localStorage
const MOCK_STORAGE_KEY = 'tdm_delbono_mock_db';

// Helper to seed initial mock database if empty
function initializeMockDb() {
  if (!localStorage.getItem(MOCK_STORAGE_KEY)) {
    const defaultData = {
      business_settings: [
        {
          id: 'b1111111-1111-1111-1111-111111111111',
          business_name: 'Tienda de Mascotas Del Bono',
          logo_url: null,
          address: 'Av. Del Bono 123, San Juan',
          phone: '+54 264 4567890',
          email: 'contacto@tdmdelbono.com',
          whatsapp: '+54 264 4567890',
          facebook: 'tdmdelbono.oficial',
          instagram: 'tdmdelbono',
          updated_at: new Date().toISOString()
        }
      ],
      clients: [
        {
          id: 'c1111111-1111-1111-1111-111111111111',
          email: 'cliente1@gmail.com',
          first_name: 'Juan',
          last_name: 'Pérez',
          phone: '2645012345',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        {
          id: 'c2222222-2222-2222-2222-222222222222',
          email: 'cliente2@gmail.com',
          first_name: 'María',
          last_name: 'González',
          phone: '2645023456',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ],
      categories: [
        {
          id: 'c8e03e5c-0974-4b5f-a3cf-e87f22a573e8',
          name: 'Baño',
          description: 'Servicios de higiene y baño general para mascotas',
          active: true,
          created_at: new Date().toISOString()
        },
        {
          id: '707d0f98-b80c-4395-8857-418080f58fe9',
          name: 'Peluquería',
          description: 'Servicios de corte, peinado y estética canina',
          active: true,
          created_at: new Date().toISOString()
        },
        {
          id: 'f6bbd677-d64e-4f36-a1ff-80c1ad2e76f5',
          name: 'Tratamientos',
          description: 'Cuidados especializados (oídos, uñas, dental, etc.)',
          active: true,
          created_at: new Date().toISOString()
        }
      ],
      services: [
        {
          id: '5a4a58eb-0797-4008-8e6c-ffb5e28ffbc2',
          category_id: 'c8e03e5c-0974-4b5f-a3cf-e87f22a573e8',
          name: 'Baño Standard',
          description: 'Baño higiénico con shampoo hipoalergénico, secado y cepillado simple.',
          image_url: null,
          estimated_duration_minutes: 45,
          active: true,
          enabled_monday: true,
          enabled_tuesday: true,
          enabled_wednesday: true,
          enabled_thursday: true,
          enabled_friday: true,
          enabled_saturday: true,
          enabled_sunday: false,
          max_concurrent_bookings: 2,
          requires_deposit: true,
          deposit_amount: 500,
          price: 2000,
          allow_reschedule: true,
          reschedule_limit_hours: 12
        },
        {
          id: '6a4a58eb-0797-4008-8e6c-ffb5e28ffbc3',
          category_id: 'c8e03e5c-0974-4b5f-a3cf-e87f22a573e8',
          name: 'Baño Medicado',
          description: 'Baño con shampoo terapéutico prescrito por veterinario para problemas dermatológicos.',
          image_url: null,
          estimated_duration_minutes: 60,
          active: true,
          enabled_monday: true,
          enabled_tuesday: true,
          enabled_wednesday: true,
          enabled_thursday: true,
          enabled_friday: true,
          enabled_saturday: true,
          enabled_sunday: false,
          max_concurrent_bookings: 2,
          requires_deposit: true,
          deposit_amount: 700,
          price: 2800,
          allow_reschedule: true,
          reschedule_limit_hours: 12
        },
        {
          id: '7a4a58eb-0797-4008-8e6c-ffb5e28ffbc4',
          category_id: '707d0f98-b80c-4395-8857-418080f58fe9',
          name: 'Corte y Baño Canino',
          description: 'Corte de raza o a elección del cliente, incluye baño higiénico, corte de uñas y limpieza de oídos.',
          image_url: null,
          estimated_duration_minutes: 90,
          active: true,
          enabled_monday: true,
          enabled_tuesday: true,
          enabled_wednesday: true,
          enabled_thursday: true,
          enabled_friday: true,
          enabled_saturday: true,
          enabled_sunday: false,
          max_concurrent_bookings: 1,
          requires_deposit: true,
          deposit_amount: 1000,
          price: 4500,
          allow_reschedule: true,
          reschedule_limit_hours: 12
        },
        {
          id: '8a4a58eb-0797-4008-8e6c-ffb5e28ffbc5',
          category_id: '707d0f98-b80c-4395-8857-418080f58fe9',
          name: 'Corte Higiénico',
          description: 'Despeje de almohadillas, zona genital y perianal. Ideal para mantenimiento rápido.',
          image_url: null,
          estimated_duration_minutes: 30,
          active: true,
          enabled_monday: true,
          enabled_tuesday: true,
          enabled_wednesday: true,
          enabled_thursday: true,
          enabled_friday: true,
          enabled_saturday: true,
          enabled_sunday: false,
          max_concurrent_bookings: 2,
          requires_deposit: false,
          deposit_amount: 0,
          price: 1800,
          allow_reschedule: true,
          reschedule_limit_hours: 6
        },
        {
          id: '9a4a58eb-0797-4008-8e6c-ffb5e28ffbc6',
          category_id: 'f6bbd677-d64e-4f36-a1ff-80c1ad2e76f5',
          name: 'Corte de Uñas',
          description: 'Corte y limado de uñas express para perros y gatos.',
          image_url: null,
          estimated_duration_minutes: 15,
          active: true,
          enabled_monday: true,
          enabled_tuesday: true,
          enabled_wednesday: true,
          enabled_thursday: true,
          enabled_friday: true,
          enabled_saturday: true,
          enabled_sunday: false,
          max_concurrent_bookings: 3,
          requires_deposit: false,
          deposit_amount: 0,
          price: 800,
          allow_reschedule: true,
          reschedule_limit_hours: 6
        }
      ],
      service_hours: [] as any[],
      holidays_blocks: [
        {
          id: 'hb111111-1111-1111-1111-111111111111',
          date: '2026-12-25',
          start_time: null,
          end_time: null,
          reason: 'Navidad'
        },
        {
          id: 'hb222222-2222-2222-2222-222222222222',
          date: '2026-01-01',
          start_time: null,
          end_time: null,
          reason: 'Año Nuevo'
        }
      ],
      bookings: [
        {
          id: 'bk111111-1111-1111-1111-111111111111',
          client_id: 'c1111111-1111-1111-1111-111111111111',
          service_id: '5a4a58eb-0797-4008-8e6c-ffb5e28ffbc2',
          booking_date: new Date(Date.now() + 86400000).toISOString().split('T')[0], // Tomorrow
          booking_time: '10:00:00',
          duration: 45,
          deposit_amount: 500,
          payment_id: 'mp_99998888',
          status: 'CONFIRMED',
          notes: 'Tiene miedo al secador.',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ]
    };

    // Prepopulate service hours
    const days = [1, 2, 3, 4, 5, 6];
    defaultData.services.forEach(service => {
      days.forEach(day => {
        defaultData.service_hours.push({
          id: `sh-${service.id}-${day}-1`,
          service_id: service.id,
          day_of_week: day,
          start_time: '09:00:00',
          end_time: '13:00:00'
        });
        defaultData.service_hours.push({
          id: `sh-${service.id}-${day}-2`,
          service_id: service.id,
          day_of_week: day,
          start_time: '16:00:00',
          end_time: '20:00:00'
        });
      });
    });

    localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(defaultData));
  }
}

// Read mock data
function getMockDb(): any {
  initializeMockDb();
  return JSON.parse(localStorage.getItem(MOCK_STORAGE_KEY) || '{}');
}

// Write mock data
function saveMockDb(data: any) {
  localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(data));
}

// Mock Supabase Query Builder
class MockQueryBuilder {
  private tableName: string;
  private db: any;

  constructor(tableName: string) {
    this.tableName = tableName;
    this.db = getMockDb();
  }

  private getTableData() {
    return this.db[this.tableName] || [];
  }

  async select(_columns: string = '*') {
    try {
      const data = this.getTableData();
      return { data, error: null };
    } catch (e: any) {
      return { data: null, error: { message: e.message } };
    }
  }

  async insert(values: any | any[]) {
    try {
      const currentData = this.getTableData();
      const newItems = Array.isArray(values) ? values : [values];

      const inserted = newItems.map(item => ({
        id: crypto.randomUUID?.() || Math.random().toString(36).substring(2, 15),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...item
      }));

      this.db[this.tableName] = [...currentData, ...inserted];
      saveMockDb(this.db);

      return { data: Array.isArray(values) ? inserted : inserted[0], error: null };
    } catch (e: any) {
      return { data: null, error: { message: e.message } };
    }
  }

  async update(values: any) {
    return {
      eq: (column: string, value: any) => {
        try {
          const currentData = this.getTableData();
          let updatedItem: any = null;
          const nextData = currentData.map((item: any) => {
            if (item[column] === value) {
              updatedItem = { ...item, ...values, updated_at: new Date().toISOString() };
              return updatedItem;
            }
            return item;
          });

          this.db[this.tableName] = nextData;
          saveMockDb(this.db);
          return Promise.resolve({ data: updatedItem, error: null });
        } catch (e: any) {
          return Promise.resolve({ data: null, error: { message: e.message } });
        }
      }
    };
  }

  async delete() {
    return {
      eq: (column: string, value: any) => {
        try {
          const currentData = this.getTableData();
          const nextData = currentData.filter((item: any) => item[column] !== value);

          this.db[this.tableName] = nextData;
          saveMockDb(this.db);
          return Promise.resolve({ data: null, error: null });
        } catch (e: any) {
          return Promise.resolve({ error: { message: e.message } });
        }
      }
    };
  }
}

// Mock Auth system
const mockAuth = {
  async getSession() {
    const session = localStorage.getItem('tdm_delbono_session');
    return { data: { session: session ? JSON.parse(session) : null }, error: null };
  },
  async signInWithPassword({ email, password }: any) {
    if (email === 'admin@delbono.com' && password === 'admin123') {
      const session = {
        user: { id: 'admin-uuid', email: 'admin@delbono.com' },
        access_token: 'mock-token-123'
      };
      localStorage.setItem('tdm_delbono_session', JSON.stringify(session));
      window.dispatchEvent(new Event('auth_state_change'));
      return { data: session, error: null };
    }
    return { data: null, error: { message: 'Credenciales de administración inválidas. Use admin@delbono.com / admin123' } };
  },
  async signOut() {
    localStorage.removeItem('tdm_delbono_session');
    window.dispatchEvent(new Event('auth_state_change'));
    return { error: null };
  },
  onAuthStateChange(callback: any) {
    const handler = () => {
      const session = localStorage.getItem('tdm_delbono_session');
      callback('SIGNED_IN', session ? JSON.parse(session) : null);
    };
    window.addEventListener('auth_state_change', handler);
    // Initial call
    setTimeout(handler, 0);
    return {
      data: {
        subscription: {
          unsubscribe() {
            window.removeEventListener('auth_state_change', handler);
          }
        }
      }
    };
  }
};

// Initialize Mock client
const mockSupabaseClient = {
  from(tableName: string) {
    return new MockQueryBuilder(tableName);
  },
  auth: mockAuth
};

// Export actual Supabase or Mock fallback
let client: any;

const isSupabaseConfigured = supabaseUrl && supabaseUrl !== 'YOUR_SUPABASE_URL' && supabaseKey;

if (isSupabaseConfigured) {
  try {
    client = createClient(supabaseUrl, supabaseKey);
    console.log('Supabase: Conectado a la base de datos real.');
  } catch (err) {
    console.warn('Supabase: Error al inicializar. Usando simulador local.', err);
    client = mockSupabaseClient;
  }
} else {
  console.log('Supabase: URL/Key no configuradas. Usando simulador local.');
  client = mockSupabaseClient;
}

export const supabase = client;
export const isMockMode = !isSupabaseConfigured;
export { initializeMockDb, getMockDb, saveMockDb };
