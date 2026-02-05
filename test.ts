// --- 1. CONFIGURATION & TYPES ---

const SubmissionStatus = {
  SUBMITTED: 'SUBMITTED',
  PENDING_PROPOSAL: 'PENDING_PROPOSAL',
  PROPOSING: 'PROPOSING',
  REJECTED: 'REJECTED',
  COMPLETED: 'COMPLETED',
} as const;

const ProjectPhaseStatus = {
  IN_PROGRESS: 'IN_PROGRESS',
  WAITING_APPROVAL: 'WAITING_APPROVAL',
  PENDING_PROPOSAL: 'PENDING_PROPOSAL',
  PROPOSING: 'PROPOSING',
  REJECTED: 'REJECTED',
  COMPLETED: 'COMPLETED',
  NOT_STARTED: 'NOT_STARTED', // สำหรับเฟสที่โดนล็อค
} as const;

type SubmissionStatus =
  (typeof SubmissionStatus)[keyof typeof SubmissionStatus];

const mapSubmissionToPhaseStatus = (status: SubmissionStatus) => {
  switch (status) {
    case SubmissionStatus.SUBMITTED:
      return ProjectPhaseStatus.WAITING_APPROVAL;
    case SubmissionStatus.PROPOSING:
      return ProjectPhaseStatus.PROPOSING;
    case SubmissionStatus.PENDING_PROPOSAL:
      return ProjectPhaseStatus.PENDING_PROPOSAL;
    case SubmissionStatus.REJECTED:
      return ProjectPhaseStatus.REJECTED;
    default:
      return ProjectPhaseStatus.IN_PROGRESS;
  }
};

// --- 2. CORE LOGIC ---

const computeStatusLogic = (
  template: any,
  submissions: any[]
): {
  status: (typeof ProjectPhaseStatus)[keyof typeof ProjectPhaseStatus];
  step?: number;
} => {
  const latestByStep = new Map<string, SubmissionStatus>();
  // กรองเอาเฉพาะสถานะล่าสุดของแต่ละ Step
  for (const s of submissions) {
    if (s.step_id && !latestByStep.has(s.step_id)) {
      latestByStep.set(s.step_id, s.status);
    }
  }

  // ลำดับ 1: เช็ก REJECTED ก่อน (Priority สูงสุด)
  for (const step of template.steps) {
    if (latestByStep.get(step.id) === SubmissionStatus.REJECTED) {
      return { status: ProjectPhaseStatus.REJECTED, step: step.order };
    }
  }

  // ลำดับ 2: หาขั้นตอนต่อไปที่ต้องทำ (ข้ามอันที่ส่งแล้วไปเลย)
  for (const step of template.steps) {
    if (!latestByStep.has(step.id)) {
      return { status: ProjectPhaseStatus.IN_PROGRESS, step: step.order };
    }
  }

  // ลำดับ 3: ถ้าส่งครบหมดแล้ว ค่อยกลับมาเช็กสถานะที่ค้างอยู่
  for (const step of template.steps) {
    const currentStatus = latestByStep.get(step.id);
    if (currentStatus !== SubmissionStatus.COMPLETED) {
      return {
        status: mapSubmissionToPhaseStatus(currentStatus as SubmissionStatus),
        step: step.order,
      };
    }
  }

  return { status: ProjectPhaseStatus.COMPLETED };
};

// ฟังก์ชันจำลองการทำงานของ 2 Phase รวมกัน
const getWorkflowStatusFull = (
  project: {
    current_template_id: string;
    proc_template_id: string;
    contract_template_id: string;
  },
  allSubmissions: any[],
  templates: Record<string, any>
) => {
  // แยกข้อมูลตาม Phase
  const procSub = allSubmissions.filter((s) => s.phase === 'PROCUREMENT');
  const contSub = allSubmissions.filter((s) => s.phase === 'CONTRACT');

  // 1. คำนวณ Procurement
  const procurement = computeStatusLogic(
    templates[project.proc_template_id],
    procSub
  );

  // 2. คำนวณ Contract
  let contract = computeStatusLogic(
    templates[project.contract_template_id],
    contSub
  );

  // --- BUSINESS RULE: Dependency Check ---
  // ถ้า current_template_id ยังไม่ใช่ของ Contract หรือ Procurement ยังไม่ Completed
  // ให้บังคับ Contract เป็น NOT_STARTED
  if (
    project.current_template_id !== project.contract_template_id ||
    procurement.status !== ProjectPhaseStatus.COMPLETED
  ) {
    contract = { status: ProjectPhaseStatus.NOT_STARTED };
  }

  return { procurement, contract };
};

// --- 3. MOCK DATA SETUP ---

const mockTemplates = {
  'T-PROC': {
    steps: [
      { id: 'p1', order: 1 },
      { id: 'p2', order: 2 },
    ],
  },
  'T-CONT': {
    steps: [
      { id: 'c1', order: 1 },
      { id: 'c2', order: 2 },
    ],
  },
};

const scenarios = [
  {
    id: 1,
    name: 'เริ่มโปรเจกต์ (Procurement Step 1)',
    current: 'T-PROC',
    data: [],
    expect: { p: 'IN_PROGRESS 1', c: 'NOT_STARTED' },
  },
  {
    id: 2,
    name: 'ส่ง Proc S1 แล้ว (รอตรวจ) -> ระบบมองหา Proc S2 ต่อ',
    current: 'T-PROC',
    data: [
      {
        phase: 'PROCUREMENT',
        step_id: 'p1',
        status: SubmissionStatus.SUBMITTED,
      },
    ],
    expect: { p: 'IN_PROGRESS 2', c: 'NOT_STARTED' },
  },
  {
    id: 3,
    name: 'Proc S2 กำลังร่างข้อเสนอ (PROPOSING) -> Contract ยังล็อค',
    current: 'T-PROC',
    data: [
      {
        phase: 'PROCUREMENT',
        step_id: 'p1',
        status: SubmissionStatus.COMPLETED,
      },
      {
        phase: 'PROCUREMENT',
        step_id: 'p2',
        status: SubmissionStatus.PROPOSING,
      },
    ],
    expect: { p: 'PROPOSING 2', c: 'NOT_STARTED' },
  },
  {
    id: 4,
    name: 'Proc เสร็จหมดแล้ว แต่ระบบยังไม่สลับ ID -> Contract ยังล็อค',
    current: 'T-PROC',
    data: [
      {
        phase: 'PROCUREMENT',
        step_id: 'p1',
        status: SubmissionStatus.COMPLETED,
      },
      {
        phase: 'PROCUREMENT',
        step_id: 'p2',
        status: SubmissionStatus.COMPLETED,
      },
    ],
    expect: { p: 'COMPLETED', c: 'NOT_STARTED' },
  },
  {
    id: 5,
    name: 'สลับ ID เป็น Contract แล้ว -> Contract เริ่มต้นได้',
    current: 'T-CONT',
    data: [
      {
        phase: 'PROCUREMENT',
        step_id: 'p1',
        status: SubmissionStatus.COMPLETED,
      },
      {
        phase: 'PROCUREMENT',
        step_id: 'p2',
        status: SubmissionStatus.COMPLETED,
      },
    ],
    expect: { p: 'COMPLETED', c: 'IN_PROGRESS 1' },
  },
  {
    id: 6,
    name: 'Contract ส่ง S1 แล้ว -> ขยับไป S2',
    current: 'T-CONT',
    data: [
      {
        phase: 'PROCUREMENT',
        step_id: 'p1',
        status: SubmissionStatus.COMPLETED,
      },
      {
        phase: 'PROCUREMENT',
        step_id: 'p2',
        status: SubmissionStatus.COMPLETED,
      },
      { phase: 'CONTRACT', step_id: 'c1', status: SubmissionStatus.SUBMITTED },
    ],
    expect: { p: 'COMPLETED', c: 'IN_PROGRESS 2' },
  },
  {
    id: 7,
    name: 'ส่งครบหมดแล้วทุกเฟส (รอหัวหน้าตรวจ)',
    current: 'T-CONT',
    data: [
      {
        phase: 'PROCUREMENT',
        step_id: 'p1',
        status: SubmissionStatus.COMPLETED,
      },
      {
        phase: 'PROCUREMENT',
        step_id: 'p2',
        status: SubmissionStatus.COMPLETED,
      },
      { phase: 'CONTRACT', step_id: 'c1', status: SubmissionStatus.COMPLETED },
      { phase: 'CONTRACT', step_id: 'c2', status: SubmissionStatus.SUBMITTED },
    ],
    expect: { p: 'COMPLETED', c: 'WAITING_APPROVAL 2' },
  },
  {
    id: 8,
    name: 'Contract โดน REJECTED',
    current: 'T-CONT',
    data: [
      {
        phase: 'PROCUREMENT',
        step_id: 'p1',
        status: SubmissionStatus.COMPLETED,
      },
      {
        phase: 'PROCUREMENT',
        step_id: 'p2',
        status: SubmissionStatus.COMPLETED,
      },
      { phase: 'CONTRACT', step_id: 'c1', status: SubmissionStatus.REJECTED },
    ],
    expect: { p: 'COMPLETED', c: 'REJECTED 1' },
  },
];

// --- 4. EXECUTION ---

console.log('=== 2-PHASE WORKFLOW LOGIC TEST ===\n');

scenarios.forEach((s) => {
  const result = getWorkflowStatusFull(
    {
      current_template_id: s.current,
      proc_template_id: 'T-PROC',
      contract_template_id: 'T-CONT',
    },
    s.data,
    mockTemplates
  );

  console.log(`${s.id}. ${s.name}`);
  console.log(`   Expected: P=${s.expect.p}, C=${s.expect.c}`);
  console.log(
    `   Actual:   P=${result.procurement.status}${result.procurement.step ? ' ' + result.procurement.step : ''}, C=${result.contract.status}${result.contract.step ? ' ' + result.contract.step : ''}`
  );
  console.log('-'.repeat(60));
});
