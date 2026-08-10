import { UnitResponsibleType } from '@prisma/client';
import { prisma } from '../src/config/prisma';

interface UnitData {
  id: string;
  name: string;
  budget_code?: string;
  type?: UnitResponsibleType[];
}

interface DepartmentData {
  id: string;
  name: string;
  units?: UnitData[];
}

export const departmentsAndUnitsData: DepartmentData[] = [
  //  คณะวิทยาศาสตร์การกีฬา 	- คณะพยาบาลศาสตร์ 	- คณะจิตวิทยา 	- คณะสหเวชศาสตร์
  {
    id: 'FAC-SPORTS-SCI',
    name: 'คณะวิทยาศาสตร์การกีฬา',
    units: [
      {
        id: 'UNIT-FAC-SPORTS-SCI',
        name: 'คณะวิทยาศาสตร์การกีฬา',
      },
    ],
  },
  {
    id: 'FAC-NURSING',
    name: 'คณะพยาบาลศาสตร์',
    units: [
      {
        id: 'UNIT-FAC-NURSING',
        name: 'คณะพยาบาลศาสตร์',
      },
    ],
  },
  {
    id: 'FAC-PSYCHOLOGY',
    name: 'คณะจิตวิทยา',
    units: [
      {
        id: 'UNIT-FAC-PSYCHOLOGY',
        name: 'คณะจิตวิทยา',
      },
    ],
  },
  {
    id: 'FAC-ALLIED-HEALTH',
    name: 'คณะสหเวชศาสตร์',
    units: [
      {
        id: 'UNIT-FAC-ALLIED-HEALTH',
        name: 'คณะสหเวชศาสตร์',
      },
    ],
  },
  {
    id: 'DEPT-SUP-OPS',
    name: 'กลุ่มดำเนินงานพัสดุภายใน',
    units: [
      {
        id: 'UNIT-PROC-1',
        name: 'กลุ่มงานจัดซื้อจัดจ้าง 1',
        type: [UnitResponsibleType.LT100K, UnitResponsibleType.LT500K],
      },
      {
        id: 'UNIT-PROC-2',
        name: 'กลุ่มงานจัดซื้อจัดจ้าง 2',
        type: [
          UnitResponsibleType.MT500K,
          UnitResponsibleType.SELECTION,
          UnitResponsibleType.EBIDDING,
          UnitResponsibleType.INTERNAL,
        ],
      },
      {
        id: 'UNIT-CONT',
        name: 'กลุ่มงานบริหารสัญญา',
        type: [UnitResponsibleType.CONTRACT],
      },
    ],
  },
  {
    id: 'DEPT-ACADEMIC',
    name: 'สำนักบริหารวิชาการ',
    units: [
      {
        id: 'UNIT-ACADEMIC',
        name: 'สำนักบริหารวิชาการ',
        budget_code: '1010100000',
      },
      {
        id: 'UNIT-ACADEMIC-STRAT',
        name: 'ฝ่ายยุทธศาสตร์และพัฒนา',
        budget_code: '1010101000',
      },
      {
        id: 'UNIT-ACADEMIC-QUAL',
        name: 'ฝ่ายมาตรฐานและคุณภาพหลักสูตร',
        budget_code: '1010102000',
      },
      {
        id: 'UNIT-ACADEMIC-MIS',
        name: 'ฝ่ายขับเคลื่อนพันธกิจฯ',
        budget_code: '1010103000',
      },
    ],
  },
  {
    id: 'DEPT-RESEARCH',
    name: 'สำนักบริหารวิจัย',
    units: [
      {
        id: 'UNIT-RESEARCH',
        name: 'สำนักบริหารวิจัย',
        budget_code: '1010200000',
      },
      {
        id: 'UNIT-RESEARCH-DEV',
        name: 'ฝ่ายพัฒนาและบูรณาการฯ',
        budget_code: '1010201000',
      },
      {
        id: 'UNIT-RESEARCH-STRAT',
        name: 'ฝ่ายยุทธศาสตร์และพันธกิจฯ',
        budget_code: '1010202000',
      },
      {
        id: 'UNIT-RESEARCH-PUB',
        name: 'ฝ่ายส่งเสริมและเผยแพร่',
        budget_code: '1010203000',
      },
    ],
  },
  {
    id: 'DEPT-STUAFF',
    name: 'สำนักบริหารกิจการนิสิต',
    units: [
      {
        id: 'UNIT-STUAFF',
        name: 'สำนักบริหารกิจการนิสิต',
        budget_code: '1010300000',
      },
      {
        id: 'UNIT-STU-SCHOLAR',
        name: 'ฝ่ายทุนการศึกษาฯ',
        budget_code: '1010301000',
      },
      {
        id: 'UNIT-STU-COORD',
        name: 'ฝ่ายประสานงานฯ',
        budget_code: '1010302000',
      },
      {
        id: 'UNIT-STU-DEV',
        name: 'ฝ่ายพัฒนานิสิต',
        budget_code: '1010303000',
      },
      {
        id: 'UNIT-STU-DORM',
        name: 'หอพักนิสิต',
        budget_code: '1010304000',
      },
      {
        id: 'UNIT-STU-HEALTH',
        name: 'ส่งเสริมสุขภาวะฯ',
        budget_code: '1010305000',
      },
    ],
  },
  {
    id: 'DEPT-CULTURE',
    name: 'สำนักบริหารศิลปวัฒนธรรม',
    units: [
      {
        id: 'UNIT-CULTURE',
        name: 'สำนักบริหารศิลปวัฒนธรรม',
        budget_code: '1010400000',
      },
      {
        id: 'UNIT-CULTURE-DHAMMA',
        name: 'ธรรมสถาน',
        budget_code: '1010401000',
      },
      {
        id: 'UNIT-CULTURE-HALL',
        name: 'หอประวัติ',
        budget_code: '1010402000',
      },
      {
        id: 'UNIT-CULTURE-DEV',
        name: 'ฝ่ายพัฒนาและส่งเสริมศิลปวัฒนธรรม',
        budget_code: '1010403000',
      },
      {
        id: 'UNIT-CULTURE-MUS',
        name: 'ฝ่ายพิพิธภัณฑ์และหอศิลป์',
        budget_code: '1010404000',
      },
      {
        id: 'UNIT-CULTURE-ROYAL',
        name: 'พิพิธภัณฑ์พระตำหนักฯ',
        budget_code: '1010405000',
      },
      {
        id: 'UNIT-CULTURE-CHUDHA',
        name: 'พิพิธภัณฑ์พระจุฑาธุช',
        budget_code: '1010406000',
      },
    ],
  },
  {
    id: 'DEPT-GLOBAL',
    name: 'สำนักบริหารวิรัชกิจและเครือข่ายนานาชาติ',
    units: [
      {
        id: 'UNIT-GLOBAL',
        name: 'สำนักบริหารวิรัชกิจและเครือข่ายนานาชาติ',
        budget_code: '1010500000',
      },
      {
        id: 'UNIT-GLOBAL-ACAD',
        name: 'ฝ่ายบริหารวิชาการนานาชาติ',
        budget_code: '1010501000',
      },
      {
        id: 'UNIT-GLOBAL-RES',
        name: 'ฝ่ายส่งเสริมการวิจัยฯ',
        budget_code: '1010502000',
      },
      {
        id: 'UNIT-GLOBAL-NET',
        name: 'ฝ่ายเครือข่ายนานาชาติฯ',
        budget_code: '1010503000',
      },
    ],
  },
  {
    id: 'DEPT-STRAT',
    name: 'สำนักยุทธศาสตร์และการขับเคลื่อน',
    units: [
      {
        id: 'UNIT-STRAT',
        name: 'สำนักยุทธศาสตร์และการขับเคลื่อน',
        budget_code: '1010600000',
      },
      {
        id: 'UNIT-STRAT-MGMT',
        name: 'ฝ่ายบริหารยุทธศาสตร์',
        budget_code: '1010601000',
      },
      {
        id: 'UNIT-STRAT-DIAG',
        name: 'ฝ่ายวินิจฉัยองค์กรฯ',
        budget_code: '1010602000',
      },
    ],
  },
  {
    id: 'DEPT-BUDGET',
    name: 'สำนักบริหารแผนและการงบประมาณ',
    units: [
      {
        id: 'UNIT-BUDGET',
        name: 'สำนักบริหารแผนและการงบประมาณ',
        budget_code: '1010700000',
      },
      {
        id: 'UNIT-BUDGET-PLAN',
        name: 'ฝ่ายแผนและสารสนเทศฯ',
        budget_code: '1010701000',
      },
      {
        id: 'UNIT-BUDGET-BUD',
        name: 'ฝ่ายการงบประมาณฯ',
        budget_code: '1010702000',
      },
      {
        id: 'UNIT-BUDGET-MGMT',
        name: 'ฝ่ายบริหารงบประมาณฯ',
        budget_code: '1010703000',
      },
    ],
  },
  {
    id: 'DEPT-FIN',
    name: 'สำนักบริหารการเงิน การบัญชี และการพัสดุ',
    units: [
      {
        id: 'UNIT-FIN',
        name: 'สำนักบริหารการเงิน การบัญชี และการพัสดุ',
        budget_code: '1010800000',
      },
      {
        id: 'UNIT-FIN-FIN',
        name: 'ฝ่ายการเงิน',
        budget_code: '1010801000',
      },
      {
        id: 'UNIT-FIN-ACC',
        name: 'ฝ่ายการบัญชี',
        budget_code: '1010802000',
      },
      {
        id: 'UNIT-FIN-SUP',
        name: 'ฝ่ายการพัสดุ',
        budget_code: '1010803000',
      },
    ],
  },
  {
    id: 'DEPT-HR',
    name: 'สำนักบริหารทรัพยากรมนุษย์',
    units: [
      {
        id: 'UNIT-HR',
        name: 'สำนักบริหารทรัพยากรมนุษย์',
        budget_code: '1010900000',
      },
      {
        id: 'UNIT-HR-ADMIN',
        name: 'ฝ่ายบริหารงานทรัพยากรบุคคล',
        budget_code: '1010901000',
      },
      {
        id: 'UNIT-HR-DEV',
        name: 'ฝ่ายการเรียนรู้และพัฒนาฯ',
        budget_code: '1010902000',
      },
      {
        id: 'UNIT-HR-STRAT',
        name: 'ฝ่ายกลยุทธ์ทรัพยากรบุคคล',
        budget_code: '1010903000',
      },
      {
        id: 'UNIT-HR-BENEFIT',
        name: 'ฝ่ายสิทธิประโยชน์และการดูแล',
        budget_code: '1010904000',
      },
    ],
  },
  {
    id: 'DEPT-LOC',
    name: 'สำนักบริหารระบบกายภาพ',
    units: [
      {
        id: 'UNIT-LOC',
        name: 'สำนักบริหารระบบกายภาพ',
        budget_code: '1011000000',
      },
      {
        id: 'UNIT-LOC-BUILD',
        name: 'ฝ่ายอาคารสถานที่',
        budget_code: '1011001000',
      },
      {
        id: 'UNIT-LOC-MAINT',
        name: 'ฝ่ายซ่อมบำรุง',
        budget_code: '1011002000',
      },
      {
        id: 'UNIT-LOC-PLAN',
        name: 'ฝ่ายวางแผน ออกแบบฯ',
        budget_code: '1011003000',
      },
      {
        id: 'UNIT-LOC-STRUCT',
        name: 'ฝ่ายโครงสร้างพื้นฐานฯ',
        budget_code: '1011004000',
      },
      {
        id: 'UNIT-LOC-CONTRACT',
        name: 'ฝ่ายบริหารสัญญาฯ',
        budget_code: '1011005000',
      },
    ],
  },
  {
    id: 'DEPT-IT',
    name: 'สำนักบริหารเทคโนโลยีสารสนเทศ',
    units: [
      {
        id: 'UNIT-IT',
        name: 'สำนักบริหารเทคโนโลยีสารสนเทศ',
        budget_code: '1011100000',
      },
      {
        id: 'UNIT-IT-INFRA',
        name: 'ฝ่ายโครงสร้างพื้นฐาน IT',
        budget_code: '1011101000',
      },
      {
        id: 'UNIT-IT-SYS',
        name: 'ฝ่ายระบบ IT',
        budget_code: '1011102000',
      },
      {
        id: 'UNIT-IT-SERV',
        name: 'ฝ่ายบริการ IT',
        budget_code: '1011103000',
      },
    ],
  },
  {
    id: 'DEPT-GENED',
    name: 'ศูนย์การศึกษาทั่วไป',
    units: [
      {
        id: 'UNIT-GENED',
        name: 'ศูนย์การศึกษาทั่วไป',
        budget_code: '1011200000',
      },
    ],
  },
  {
    id: 'DEPT-CHULA-RURAL',
    name: 'ศูนย์จุฬาฯ-ชนบท',
    units: [
      {
        id: 'UNIT-CHULA-RURAL',
        name: 'ศูนย์จุฬาฯ-ชนบท',
        budget_code: '1011300000',
      },
    ],
  },
  {
    id: 'DEPT-INNOVATION',
    name: 'ศูนย์นวัตกรรมการเรียนรู้',
    units: [
      {
        id: 'UNIT-INNOVATION',
        name: 'ศูนย์นวัตกรรมการเรียนรู้',
        budget_code: '1011400000',
      },
    ],
  },
  {
    id: 'DEPT-CENTRAL',
    name: 'ศูนย์บริหารกลาง',
    units: [
      {
        id: 'UNIT-CENTRAL',
        name: 'ศูนย์บริหารกลาง',
        budget_code: '1011500000',
      },
    ],
  },
  {
    id: 'DEPT-LEGAL',
    name: 'สำนักกฎหมายและนิติการ',
    units: [
      {
        id: 'UNIT-LEGAL',
        name: 'สำนักกฎหมายและนิติการ',
        budget_code: '1011600000',
      },
      {
        id: 'UNIT-LEGAL-CASE',
        name: 'ฝ่ายคดีและข้อมูลส่วนบุคคล',
        budget_code: '1011601000',
      },
      {
        id: 'UNIT-LEGAL-AGREE',
        name: 'ฝ่ายสัญญาและข้อตกลง',
        budget_code: '1011602000',
      },
      {
        id: 'UNIT-LEGAL-DEV',
        name: 'ฝ่ายพัฒนากฎหมายฯ',
        budget_code: '1011603000',
      },
    ],
  },
  {
    id: 'DEPT-COMMS',
    name: 'ศูนย์สื่อสารองค์กร',
    units: [
      {
        id: 'UNIT-COMMS',
        name: 'ศูนย์สื่อสารองค์กร',
        budget_code: '1011700000',
      },
    ],
  },
  {
    id: 'DEPT-ERP',
    name: 'ศูนย์ CU-ERP',
    units: [
      {
        id: 'UNIT-ERP',
        name: 'ศูนย์ CU-ERP',
        budget_code: '1011800000',
      },
    ],
  },
  {
    id: 'DEPT-RISK',
    name: 'ศูนย์บริหารความเสี่ยง',
    units: [
      {
        id: 'UNIT-RISK',
        name: 'ศูนย์บริหารความเสี่ยง',
        budget_code: '1011900000',
      },
    ],
  },
  {
    id: 'DEPT-ALUMNI',
    name: 'ศูนย์พัฒนากิจและนิสิตเก่าสัมพันธ์',
    units: [
      {
        id: 'UNIT-ALUMNI',
        name: 'ศูนย์พัฒนากิจและนิสิตเก่าสัมพันธ์',
        budget_code: '1012000000',
      },
    ],
  },
  {
    id: 'DEPT-INVEST',
    name: 'ศูนย์วิเคราะห์รายได้และปฏิบัติการลงทุน',
    units: [
      {
        id: 'UNIT-INVEST',
        name: 'ศูนย์วิเคราะห์รายได้และปฏิบัติการลงทุน',
        budget_code: '1012100000',
      },
    ],
  },
  {
    id: 'DEPT-SHE',
    name: 'ศูนย์ความปลอดภัย อาชีวอนามัย และสิ่งแวดล้อม',
    units: [
      {
        id: 'UNIT-SHE',
        name: 'ศูนย์ความปลอดภัย อาชีวอนามัย และสิ่งแวดล้อม',
        budget_code: '1012200000',
      },
    ],
  },
  {
    id: 'DEPT-RUSSIA',
    name: 'ศูนย์รัสเซียศึกษา',
    units: [
      {
        id: 'UNIT-RUSSIA',
        name: 'ศูนย์รัสเซียศึกษา',
        budget_code: '1012500000',
      },
    ],
  },
  {
    id: 'DEPT-SECURITY',
    name: 'ศูนย์รักษาความปลอดภัย และจัดการจราจรแห่งจุฬาฯ',
    units: [
      {
        id: 'UNIT-SECURITY',
        name: 'ศูนย์รักษาความปลอดภัย และจัดการจราจรแห่งจุฬาฯ',
        budget_code: '1012800000',
      },
    ],
  },
  {
    id: 'DEPT-SENATE',
    name: 'สภาคณาจารย์',
    units: [
      {
        id: 'UNIT-SENATE',
        name: 'สภาคณาจารย์',
        budget_code: '1012900000',
      },
    ],
  },
  {
    id: 'DEPT-HEALTH',
    name: 'ศูนย์บริการสุขภาพ',
    units: [
      {
        id: 'UNIT-HEALTH',
        name: 'ศูนย์บริการสุขภาพ',
        budget_code: '1013000000',
      },
      {
        id: 'UNIT-HEALTH-MED',
        name: 'กลุ่มภารกิจบริการทางการแพทย์',
        budget_code: '1013001000',
      },
      {
        id: 'UNIT-HEALTH-PROMO',
        name: 'กลุ่มภารกิจส่งเสริมและเสริมสร้าง',
        budget_code: '1013002000',
      },
    ],
  },
  {
    id: 'DEPT-REG',
    name: 'สำนักงานทะเบียน',
    units: [
      {
        id: 'UNIT-REG',
        name: 'สำนักงานทะเบียน',
      },
    ],
  },
  {
    id: 'DEPT-SPORTS',
    name: 'ศูนย์กีฬาแห่งจุฬาลงกรณ์มหาวิทยาลัย',
    units: [
      {
        id: 'UNIT-SPORTS',
        name: 'ศูนย์กีฬาแห่งจุฬาลงกรณ์มหาวิทยาลัย',
        budget_code: '1013100000',
      },
    ],
  },
];

export async function clearOldData() {
  console.log('Clearing existing department and unit data...');
  await prisma.userOrganizationRole.deleteMany();
  await prisma.budgetPlan.deleteMany();
  await prisma.project.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.department.deleteMany();
  console.log('Old data cleared successfully.');
}

export async function seedDepartmentsAndUnits() {
  await clearOldData();
  console.log('Seeding departments and units...');
  let deptCount = 0;
  let unitCount = 0;

  for (const dept of departmentsAndUnitsData) {
    await prisma.department.upsert({
      where: { id: dept.id },
      update: {
        name: dept.name,
      },
      create: {
        id: dept.id,
        name: dept.name,
      },
    });
    deptCount++;

    if (dept.units && dept.units.length > 0) {
      for (const unit of dept.units) {
        await prisma.unit.upsert({
          where: { id: unit.id },
          update: {
            name: unit.name,
            dept_id: dept.id,
            budget_code: unit.budget_code ?? null,
            type: unit.type ?? [],
          },
          create: {
            id: unit.id,
            dept_id: dept.id,
            name: unit.name,
            budget_code: unit.budget_code ?? null,
            type: unit.type ?? [],
          },
        });
        unitCount++;
      }
    }
  }

  console.log(
    `Successfully seeded ${deptCount} departments and ${unitCount} units!`
  );
}

if (require.main === module) {
  seedDepartmentsAndUnits()
    .catch((e) => {
      console.error('Error seeding departments and units:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
