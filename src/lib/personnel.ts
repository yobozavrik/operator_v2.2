'use client';

// Personnel data for Graviton production facility
// Norm: ~55 kg per person per shift

export interface Employee {
    id: number;
    name: string;
    position: 'Старший смени' | 'Работник кухни' | 'Шокер';
    isLeader?: boolean;
}

export interface Shift {
    id: 1 | 2;
    name: string;
    leader: string;
    dataDate: string;
    employees: Employee[];
}

export const SHIFTS: Shift[] = [
    {
        id: 1,
        name: 'Зміна №1',
        leader: 'Спіжарська Мар\'яна',
        dataDate: '18.01',
        employees: [
            { id: 1, name: 'Спіжарська Мар\'яна', position: 'Старший смени', isLeader: true },
            { id: 2, name: 'Вербівська Рената', position: 'Работник кухни' },
            { id: 3, name: 'Харик Ольга', position: 'Работник кухни' },
            { id: 4, name: 'Плачінта Лілія', position: 'Работник кухни' },
            { id: 5, name: 'Гончарюк Аліна', position: 'Работник кухни' },
            { id: 6, name: 'Панка Інна', position: 'Работник кухни' },
            { id: 7, name: 'Гашук Анастасія', position: 'Работник кухни' },
            { id: 8, name: 'Мартиніс Альона', position: 'Работник кухни' },
            { id: 9, name: 'Стасюк Мар\'яна', position: 'Шокер' },
        ]
    },
    {
        id: 2,
        name: 'Зміна №2',
        leader: 'Берник Марія',
        dataDate: '15.01',
        employees: [
            { id: 1, name: 'Берник Марія', position: 'Старший смени', isLeader: true },
            { id: 2, name: 'Ощепко Родіка', position: 'Работник кухни' },
            { id: 3, name: 'Вербівська Рената', position: 'Работник кухни' },
            { id: 4, name: 'Панка Інна', position: 'Работник кухни' },
            { id: 5, name: 'Крамінцева Тетяна', position: 'Работник кухни' },
            { id: 6, name: 'Гашук Анастасія', position: 'Работник кухни' },
            { id: 7, name: 'Романова Оксана', position: 'Работник кухни' },
            { id: 8, name: 'Мартиніс Альона', position: 'Работник кухни' },
            { id: 9, name: 'Голубєва Ірина', position: 'Шокер' },
        ]
    }
];

// Production norm per person per shift (in kg)
export const PRODUCTION_NORM_PER_PERSON = 55;

// Calculate expected production capacity for a shift
export const getShiftCapacity = (shift: Shift): number => {
    return shift.employees.length * PRODUCTION_NORM_PER_PERSON;
};

// Get current shift based on time
export const getCurrentShift = (): Shift | null => {
    const now = new Date();
    const hours = now.getHours();

    // Assuming Shift 1: 06:00-14:00, Shift 2: 14:00-22:00
    if (hours >= 6 && hours < 14) {
        return SHIFTS[0]; // Shift 1
    } else if (hours >= 14 && hours < 22) {
        return SHIFTS[1]; // Shift 2
    }

    return null; // Night time - no shift
};
