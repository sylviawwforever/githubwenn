/* =========================================================
   About Me · data.js
   食物 / 连锁饮品 / 运动 基础数据
   数据参考品牌公开营养信息与小红书热量标注，实际以门店为准。
   ========================================================= */

/* ---------- 常见食物：每 100g 热量 (kcal) ---------- */
const FOOD_DB = {
  '米饭': 116, '面条': 110, '馒头': 223, '全麦面包': 246, '白面包': 312,
  '鸡蛋': 144, '鸡胸肉': 133, '鸡腿': 181, '牛肉': 125, '瘦猪肉': 143,
  '五花肉': 395, '三文鱼': 208, '虾': 93, '豆腐': 82, '牛奶': 54,
  '酸奶': 72, '豆浆': 31, '苹果': 52, '香蕉': 89, '橙子': 47,
  '葡萄': 43, '西瓜': 25, '草莓': 32, '西兰花': 34, '番茄': 20,
  '黄瓜': 16, '生菜': 15, '土豆': 77, '红薯': 86, '玉米': 112,
  '可乐': 43, '薯条': 312, '汉堡': 295, '披萨': 266, '方便面': 472,
  '巧克力': 546, '蛋糕': 347, '冰淇淋': 207, '珍珠奶茶': 90, '拿铁': 55,
  '水饺': 240, '包子': 227, '炒饭': 163, '炸鸡': 279, '麻辣烫': 130
};

/* ---------- 连锁饮品库 ----------
   base  = 标准糖 + 标准冰 时每杯热量 (kcal)
   sugar = 其中来自糖的热量 (kcal)，用于按糖度折算
   计算：kcal = ((base - sugar) + sugar × 糖度系数) × 冰量系数
---------------------------------------------------- */
const DRINK_DB = {
  '瑞幸咖啡': {
    '生椰拿铁': { base: 190, sugar: 90 },
    '生酪拿铁': { base: 220, sugar: 100 },
    '厚乳拿铁': { base: 240, sugar: 110 },
    '标准美式': { base: 15, sugar: 10 },
    '加浓美式': { base: 20, sugar: 12 },
    '生椰丝绒拿铁': { base: 260, sugar: 130 },
    '陨石拿铁': { base: 210, sugar: 100 },
    '橙C美式': { base: 90, sugar: 70 },
    '柚C美式': { base: 85, sugar: 65 },
    '椰云拿铁': { base: 200, sugar: 95 },
    '抹茶瑞纳冰': { base: 320, sugar: 180 },
    '乳酸菌美式': { base: 90, sugar: 75 },
    '全冰黑巧美式': { base: 60, sugar: 40 },
    '椰青冰萃美式': { base: 70, sugar: 45 },
    '小黄油美式': { base: 60, sugar: 35 },
    '小黄油拿铁': { base: 235, sugar: 110 },
    '葡萄冰萃美式': { base: 80, sugar: 55 },
    '葡萄冰茶': { base: 120, sugar: 90 },
    '茉莉花香美式': { base: 40, sugar: 25 }
  },
  '喜茶': {
    '多肉葡萄': { base: 220, sugar: 150 },
    '芝芝莓莓': { base: 300, sugar: 180 },
    '满杯红柚': { base: 180, sugar: 130 },
    '烤黑糖波波牛乳': { base: 380, sugar: 220 },
    '波波奶茶': { base: 320, sugar: 180 },
    '芝芝芒芒': { base: 290, sugar: 175 },
    '多肉青提': { base: 200, sugar: 140 },
    '多肉桃李': { base: 210, sugar: 150 },
    '杨桃三重甘': { base: 190, sugar: 130 },
    '荔枝鲜': { base: 200, sugar: 150 },
    '多肉芒芒': { base: 230, sugar: 160 },
    '奇兰苹果杏': { base: 220, sugar: 150 },
    '奇兰芭乐莲雾': { base: 200, sugar: 140 },
    '奇兰粉芭乐': { base: 210, sugar: 145 },
    '咸酪碎银子': { base: 330, sugar: 180 },
    '小奶茉': { base: 300, sugar: 180 },
    '轻酵黄皮康普茶': { base: 120, sugar: 80 },
    '清爽芭乐提': { base: 190, sugar: 135 },
    '芒椰糯米饭': { base: 360, sugar: 200 }
  },
  '霸王茶姬': {
    '伯牙绝弦': { base: 230, sugar: 120 },
    '轻因·伯牙绝弦': { base: 180, sugar: 95 },
    '桂馥兰香': { base: 240, sugar: 125 },
    '万里木兰': { base: 220, sugar: 115 },
    '山茶花乌龙': { base: 180, sugar: 95 },
    '青青糯山': { base: 250, sugar: 130 },
    '花田乌龙': { base: 260, sugar: 140 },
    '白雾红尘': { base: 230, sugar: 120 },
    '青沫观音': { base: 210, sugar: 110 },
    '玫瑰普洱': { base: 210, sugar: 115 }
  },
  '一点点': {
    '抹茶': { base: 300, sugar: 175 },
    '西瓜奶绿': { base: 280, sugar: 180 },
    '冰淇淋红茶': { base: 320, sugar: 180 },
    'QQ美莓奶茶': { base: 330, sugar: 200 },
    '苹果茉莉绿': { base: 200, sugar: 140 },
    '经典奶茶': { base: 320, sugar: 180 },
    '波霸奶茶': { base: 360, sugar: 200 },
    '四季春茶': { base: 120, sugar: 90 },
    '红玉红茶': { base: 110, sugar: 85 },
    '冰淇淋草莓红': { base: 300, sugar: 175 },
    '葡萄柚绿': { base: 190, sugar: 130 }
  },
  '茉莉奶白': {
    '茉莉奶白': { base: 300, sugar: 170 },
    '桂花龙井': { base: 260, sugar: 150 },
    '白桃乌龙': { base: 280, sugar: 160 },
    '经典奶茶': { base: 320, sugar: 180 },
    '栀子白兰': { base: 270, sugar: 155 },
    '蜜桃茉莉': { base: 280, sugar: 160 }
  },
  '茶颜悦色': {
    '幽兰拿铁': { base: 320, sugar: 180 },
    '声声乌龙': { base: 280, sugar: 160 },
    '桂花弄': { base: 260, sugar: 150 },
    '人间烟火': { base: 300, sugar: 170 },
    '筝筝纸鸢': { base: 290, sugar: 165 },
    '栀晓': { base: 270, sugar: 155 },
    '凤栖绿桂': { base: 250, sugar: 145 }
  },
  '阿嬷手作': {
    '鲜奶麻薯茶': { base: 380, sugar: 210 },
    '芋泥波波鲜奶': { base: 420, sugar: 230 },
    '茉莉云顶': { base: 320, sugar: 180 }
  },
  '煲珠公': {
    '老红糖珍珠鲜奶': { base: 400, sugar: 240 },
    '招牌珍珠奶茶': { base: 360, sugar: 205 },
    '黑糖波波鲜奶': { base: 420, sugar: 250 }
  },
  '去茶山': {
    '芝士葡萄': { base: 260, sugar: 170 },
    '桂香乌龙': { base: 230, sugar: 130 },
    '鲜果茶': { base: 200, sugar: 150 },
    '满杯百香果': { base: 210, sugar: 155 }
  },
  '李山山茶事': {
    '山野茉莉': { base: 210, sugar: 120 },
    '白桃乌龙': { base: 230, sugar: 130 },
    '桂花龙井': { base: 220, sugar: 125 },
    '李山山轻乳茶': { base: 200, sugar: 110 }
  },
  '奈雪的茶': {
    '霸气橙子': { base: 200, sugar: 150 },
    '霸气芝士草莓': { base: 310, sugar: 185 },
    '霸气葡萄': { base: 260, sugar: 170 },
    '鸭屎香宝藏茶': { base: 300, sugar: 170 },
    '芋泥波波': { base: 400, sugar: 220 }
  },
  '另茶': {
    '鸭屎香柠檬茶': { base: 150, sugar: 110 },
    '手打柠檬茶': { base: 140, sugar: 100 },
    '四季春茶': { base: 110, sugar: 80 }
  },
  '益禾堂': {
    '益禾烤奶': { base: 330, sugar: 190 },
    '杨枝甘露': { base: 350, sugar: 210 },
    '满杯百香果': { base: 210, sugar: 150 },
    '茉莉蜜茶': { base: 180, sugar: 130 }
  },
  'KOI': {
    '黄金珍奶': { base: 380, sugar: 210 },
    '芭乐绿茶': { base: 190, sugar: 140 },
    '四季春玛奇朵': { base: 320, sugar: 180 }
  },
  '蜜雪冰城': {
    '冰鲜柠檬水': { base: 90, sugar: 80 },
    '珍珠奶茶': { base: 300, sugar: 170 },
    '芝士奶盖四季春': { base: 280, sugar: 150 },
    '满杯百香果': { base: 200, sugar: 150 },
    '香草奶昔': { base: 300, sugar: 180 }
  },
  '茶百道': {
    '杨枝甘露': { base: 330, sugar: 200 },
    '豆乳玉麒麟': { base: 350, sugar: 190 },
    '西瓜啵啵': { base: 210, sugar: 150 },
    '桂花酒酿': { base: 350, sugar: 190 },
    '芋泥啵啵奶茶': { base: 380, sugar: 210 }
  },
  '古茗': {
    '芝士奶盖四季春': { base: 300, sugar: 170 },
    '杨枝甘露': { base: 350, sugar: 200 },
    '布蕾奶茶': { base: 340, sugar: 190 },
    '超A芝士葡萄': { base: 280, sugar: 170 },
    '招牌奶绿': { base: 280, sugar: 160 },
    '生椰拿铁': { base: 200, sugar: 90 }
  },
  '沪上阿姨': {
    '血糯米奶茶': { base: 380, sugar: 210 },
    '杨枝甘露': { base: 350, sugar: 200 },
    '杨梅酸奶': { base: 260, sugar: 150 },
    '五谷血糯米': { base: 360, sugar: 195 }
  },
  'CoCo都可': {
    '珍珠奶茶': { base: 340, sugar: 190 },
    '百香双响炮': { base: 220, sugar: 160 },
    '奶茶三兄弟': { base: 380, sugar: 210 },
    '都可纯茶': { base: 90, sugar: 55 },
    '双球冰淇淋红茶': { base: 330, sugar: 185 }
  },
  '书亦烧仙草': {
    '烧仙草奶茶': { base: 360, sugar: 200 },
    '杨枝甘露': { base: 350, sugar: 205 },
    '双拼烧仙草': { base: 400, sugar: 220 },
    '橙漫刺梨山茶花': { base: 220, sugar: 145 }
  },
  '星巴克': {
    '拿铁': { base: 180, sugar: 90 },
    '燕麦拿铁': { base: 190, sugar: 85 },
    '美式咖啡': { base: 15, sugar: 10 },
    '焦糖玛奇朵': { base: 270, sugar: 140 },
    '摩卡': { base: 290, sugar: 150 },
    '香草拿铁': { base: 250, sugar: 120 },
    '抹茶拿铁': { base: 270, sugar: 135 },
    '星冰乐': { base: 350, sugar: 200 },
    '冷萃咖啡': { base: 20, sugar: 12 },
    '馥芮白': { base: 220, sugar: 100 }
  },
  '库迪咖啡': {
    '生椰拿铁': { base: 180, sugar: 85 },
    '厚乳拿铁': { base: 230, sugar: 110 },
    '标准美式': { base: 15, sugar: 10 },
    '橙C美式': { base: 90, sugar: 70 },
    '椰云拿铁': { base: 200, sugar: 95 },
    '瓦罐拿铁': { base: 240, sugar: 115 }
  },
  'Manner': {
    '拿铁': { base: 170, sugar: 80 },
    '燕麦拿铁': { base: 185, sugar: 85 },
    '美式': { base: 10, sugar: 8 },
    '澳白': { base: 200, sugar: 95 },
    '桂花拿铁': { base: 210, sugar: 100 }
  },
  '挪瓦咖啡': {
    '生椰拿铁': { base: 175, sugar: 85 },
    '燕麦曲奇拿铁': { base: 260, sugar: 130 },
    '美式': { base: 15, sugar: 10 },
    '轻乳茶': { base: 190, sugar: 100 }
  },
  '幸运咖': {
    '招牌拿铁': { base: 170, sugar: 85 },
    '生椰拿铁': { base: 175, sugar: 85 },
    '美式': { base: 10, sugar: 8 },
    '雪顶咖啡': { base: 300, sugar: 170 }
  },
  '甜啦啦': {
    '茉莉奶绿': { base: 210, sugar: 110 },
    '葡萄冻冻': { base: 160, sugar: 120 },
    '桂花乌龙奶茶': { base: 230, sugar: 130 },
    '杨枝甘露': { base: 240, sugar: 150 },
    '鲜柠檬水': { base: 60, sugar: 50 }
  },
  '7分甜': {
    '杨枝甘露': { base: 250, sugar: 160 },
    '芒果椰椰': { base: 260, sugar: 160 },
    '满杯百香果': { base: 150, sugar: 120 },
    '茉莉奶绿': { base: 220, sugar: 115 }
  },
  '乐乐茶': {
    '酪酪玫瑰': { base: 280, sugar: 170 },
    '草莓桃子酪酪': { base: 300, sugar: 190 },
    '黑糖波波牛乳': { base: 370, sugar: 210 },
    '杨枝甘露': { base: 260, sugar: 160 }
  },
  '茶话弄': {
    '桂花引': { base: 240, sugar: 140 },
    '梅占摇红': { base: 260, sugar: 150 },
    '丝袜奶茶': { base: 320, sugar: 180 },
    '三泡台': { base: 220, sugar: 130 }
  },
  '爷爷不泡茶': {
    '白桃乌龙': { base: 230, sugar: 140 },
    '桂花轻乳茶': { base: 250, sugar: 145 },
    '茉莉奶绿': { base: 270, sugar: 155 },
    '荔枝奶绿': { base: 280, sugar: 160 },
    '爷爷玫瑰': { base: 260, sugar: 150 }
  },
  '初茶': {
    '初茶招牌奶茶': { base: 330, sugar: 185 },
    '鸭屎香柠檬茶': { base: 140, sugar: 100 },
    '四季春纯茶': { base: 90, sugar: 55 },
    '芝士葡萄': { base: 260, sugar: 165 },
    '初茶烤奶': { base: 310, sugar: 175 }
  },
  '陈文鼎': {
    '黑糖珍珠鲜奶': { base: 390, sugar: 230 },
    '黑糖珍珠奶茶': { base: 360, sugar: 200 },
    '桂花龙井': { base: 240, sugar: 135 },
    '陈文鼎纯茶': { base: 100, sugar: 60 }
  },
  '茶理宜世': {
    '烟雨江南': { base: 260, sugar: 145 },
    '荔韵桃桃': { base: 250, sugar: 160 },
    '轻脂乳茶': { base: 220, sugar: 120 },
    '桂花酿': { base: 270, sugar: 155 },
    '胭脂点点': { base: 280, sugar: 160 }
  },
  '真茶屋': {
    '真茶轻乳': { base: 240, sugar: 130 },
    '茉莉奶绿': { base: 260, sugar: 150 },
    '芝士葡萄': { base: 270, sugar: 170 },
    '真茶纯萃': { base: 95, sugar: 55 }
  },
  '裕莲茶楼': {
    '招牌奶茶': { base: 340, sugar: 190 },
    '桂花酒酿': { base: 320, sugar: 180 },
    '四季春茶': { base: 100, sugar: 60 },
    '荷塘月色': { base: 250, sugar: 140 }
  },
  '茉酸奶': {
    '牛油果酸奶奶昔': { base: 320, sugar: 130 },
    '芒果酸奶奶昔': { base: 300, sugar: 150 },
    '草莓酸奶奶昔': { base: 280, sugar: 145 },
    '原味酸奶奶昔': { base: 220, sugar: 110 },
    '黑加仑酸奶奶昔': { base: 270, sugar: 140 }
  },
  '茶救星球': {
    '苦瓜柠檬茶': { base: 130, sugar: 90 },
    '斑斓柠檬茶': { base: 140, sugar: 95 },
    '葡萄柠檬茶': { base: 160, sugar: 115 },
    '百香果柠檬茶': { base: 150, sugar: 110 },
    '番茄柠檬茶': { base: 140, sugar: 100 }
  },
  '一只酸奶牛': {
    '紫米酸奶': { base: 300, sugar: 150 },
    '原味酸奶': { base: 180, sugar: 95 },
    '芒果酸奶': { base: 260, sugar: 140 },
    '草莓酸奶': { base: 250, sugar: 135 }
  },
  '李若桃': {
    '桃桃酸奶': { base: 280, sugar: 155 },
    '芒果酸奶': { base: 270, sugar: 150 },
    '原味手作酸奶': { base: 200, sugar: 105 },
    '蜜桃乌龙': { base: 230, sugar: 140 }
  },
  '树夏': {
    '羽衣甘蓝酸奶': { base: 250, sugar: 110 },
    '草莓酸奶': { base: 270, sugar: 145 },
    '芒果酸奶': { base: 280, sugar: 150 },
    '树夏轻乳茶': { base: 200, sugar: 110 }
  },
  '林里': {
    '手打柠檬茶': { base: 130, sugar: 95 },
    '鸭屎香柠檬茶': { base: 140, sugar: 100 },
    '黄皮柠檬茶': { base: 150, sugar: 105 },
    '柠檬绿茶': { base: 120, sugar: 85 }
  },
  '麒麟大口茶': {
    '招牌大口茶': { base: 160, sugar: 115 },
    '麒麟轻乳茶': { base: 230, sugar: 125 },
    '柠檬茶': { base: 130, sugar: 90 },
    '大口烤奶': { base: 300, sugar: 170 }
  },
  '百分茶': {
    '竹蔗马蹄': { base: 200, sugar: 130 },
    '桃喜芒芒': { base: 260, sugar: 165 },
    '葡萄多多': { base: 230, sugar: 150 },
    '茉莉奶绿': { base: 250, sugar: 145 },
    '百分鲜奶茶': { base: 320, sugar: 180 }
  }
};

/* 品牌官方图标（本地文件，取自各品牌官网与公开品牌盘点），没有的自动回退成配色圆标 */
const BRAND_LOGO = {
  '瑞幸咖啡': 'assets/logos/luckin.ico',
  '喜茶': 'assets/logos/heytea.webp',
  '霸王茶姬': 'assets/logos/chagee.ico',
  '一点点': 'assets/logos/yidiandian.png',
  '茉莉奶白': 'assets/logos/mollytea.png',
  '茶颜悦色': 'assets/logos/chayan.png',
  '阿嬷手作': 'assets/logos/ama.png',
  '煲珠公': 'assets/logos/baozhu.png',
  '去茶山': 'assets/logos/quchashan.png',
  '李山山茶事': 'assets/logos/lishanshan.png',
  '奈雪的茶': 'assets/logos/naixue.png',
  '另茶': 'assets/logos/lingcha.png',
  '益禾堂': 'assets/logos/yihetang.png',
  'KOI': 'assets/logos/koi.png',
  '蜜雪冰城': 'assets/logos/mixue.ico',
  '茶百道': 'assets/logos/chabaidao.png',
  '古茗': 'assets/logos/guming.ico',
  '沪上阿姨': 'assets/logos/hushang.png',
  'CoCo都可': 'assets/logos/coco.png',
  '书亦烧仙草': 'assets/logos/shuyi.png'
};

/* 品牌图标：卡片风格（img=真实logo，bg/fg/logo=卡片视觉） */
const BRAND_META = {
  '霸王茶姬': { color: '#b02a2e', short: '霸', img: 'assets/logos/chagee.ico', bg: '#ffffff', fg: '', logo: '', fgColor: '#b02a2e' },
  '喜茶': { color: '#111111', short: '喜', img: 'assets/logos/heytea.webp', bg: '#ffffff', fg: '', logo: '喜茶', fgColor: '#111111' },
  '茉莉奶白': { color: '#1a1a1a', short: '茉', img: 'assets/logos/mollytea.png', bg: '#ffffff', fg: '', logo: '茉莉奶白', fgColor: '#1a1a1a' },
  '沪上阿姨': { color: '#e8442e', short: '沪', img: 'assets/logos/hushang.png', bg: '#ffffff', fg: '', logo: '', fgColor: '#e8442e' },
  '蜜雪冰城': { color: '#d33a2c', short: '蜜', img: 'assets/logos/mixue.ico', bg: '#ffffff', fg: '⛄', logo: '', fgColor: '#d33a2c' },
  '古茗': { color: '#111111', short: '古', img: '', bg: '#ffffff', fg: '', logo: '古茗', fgColor: '#111111' },
  '茶百道': { color: '#2456b8', short: '百', img: 'assets/logos/chabaidao.png', bg: '#ffffff', fg: '', logo: '', fgColor: '#2456b8' },
  '一点点': { color: '#1f7a43', short: '一', img: '', bg: '#ffffff', fg: '', logo: '1点点', fgColor: '#1f7a43' },
  '茶颜悦色': { color: '#5a3a2a', short: '茶', img: 'assets/logos/chayan.png', bg: '#ffffff', fg: '', logo: '茶颜悦色', fgColor: '#5a3a2a' },
  '奈雪的茶': { color: '#7ab648', short: '奈', img: 'assets/logos/naixue.png', bg: '#7ab648', fg: '', logo: '奈雪的茶', fgColor: '#ffffff' },
  '爷爷不泡茶': { color: '#a67c52', short: '爷', img: '', bg: '#ffffff', fg: '', logo: '爷爷不泡茶', fgColor: '#a67c52' },
  '阿嬷手作': { color: '#8a6d4e', short: '阿', img: 'assets/logos/ama.png', bg: '#ffffff', fg: '', logo: '阿嬷手作', fgColor: '#8a6d4e' },
  '茶话弄': { color: '#f05a28', short: '弄', img: '', bg: '#f05a28', fg: '', logo: '茶话弄', fgColor: '#ffffff' },
  '煲珠公': { color: '#2b4cb3', short: '煲', img: 'assets/logos/baozhu.png', bg: '#2b4cb3', fg: '👴', logo: '', fgColor: '#ffffff' },
  '初茶': { color: '#1a4f9c', short: '初', img: '', bg: '#ffffff', fg: '', logo: '初茶', fgColor: '#1a4f9c' },
  '去茶山': { color: '#b49a68', short: '去', img: 'assets/logos/quchashan.png', bg: '#b49a68', fg: '⛰️', logo: '', fgColor: '#ffffff' },
  '陈文鼎': { color: '#b02a2a', short: '陈', img: '', bg: '#ffffff', fg: '', logo: '陳文鼎', fgColor: '#b02a2a' },
  '李山山茶事': { color: '#111111', short: '李', img: 'assets/logos/lishanshan.png', bg: '#ffffff', fg: '', logo: '李山山', fgColor: '#111111' },
  '茶理宜世': { color: '#8a6a3a', short: '理', img: '', bg: '#ffffff', fg: '', logo: '茶理宜世', fgColor: '#8a6a3a' },
  '真茶屋': { color: '#6f9b3f', short: '真', img: '', bg: '#6f9b3f', fg: '', logo: '真', fgColor: '#ffffff' },
  '益禾堂': { color: '#2f9e6f', short: '益', img: 'assets/logos/yihetang.png', bg: '#ffffff', fg: '', logo: '益禾堂', fgColor: '#2f9e6f' },
  '甜啦啦': { color: '#ffd200', short: '甜', img: '', bg: '#ffd200', fg: '🐻', fgColor: '#111111' },
  '书亦烧仙草': { color: '#c0272d', short: '书', img: 'assets/logos/shuyi.png', bg: '#ffffff', fg: '', logo: '书亦', fgColor: '#c0272d' },
  'CoCo都可': { color: '#f05a1e', short: 'C', img: 'assets/logos/coco.png', bg: '#f05a1e', fg: '', logo: 'CoCo', fgColor: '#ffffff' },
  '另茶': { color: '#111111', short: '另', img: 'assets/logos/lingcha.png', bg: '#ffffff', fg: '', logo: 'OT另茶', fgColor: '#111111' },
  'KOI': { color: '#111111', short: 'K', img: 'assets/logos/koi.png', bg: '#ffffff', fg: '', logo: 'KOI', fgColor: '#111111' },
  '裕莲茶楼': { color: '#111111', short: '裕', img: '', bg: '#111111', fg: '', logo: '裕莲茶楼', fgColor: '#ffffff' },
  '茉酸奶': { color: '#2f6b3a', short: '奶', img: '', bg: '#ffffff', fg: '', logo: '茉', fgColor: '#2f6b3a' },
  '乐乐茶': { color: '#111111', short: '乐', img: '', bg: '#ffffff', fg: '', logo: '乐乐茶', fgColor: '#111111' },
  '茶救星球': { color: '#1e4d9c', short: '救', img: '', bg: '#1e4d9c', fg: '', logo: '茶救星球', fgColor: '#ffffff' },
  '一只酸奶牛': { color: '#7b5ea7', short: '牛', img: '', bg: '#ffffff', fg: '', logo: '一只酸奶牛', fgColor: '#7b5ea7' },
  '李若桃': { color: '#6b4a3a', short: '李', img: '', bg: '#e8cfc3', fg: '', logo: '李若桃', fgColor: '#6b4a3a' },
  '树夏': { color: '#7ab648', short: '树', img: '', bg: '#ffffff', fg: '', logo: '树夏', fgColor: '#7ab648' },
  '林里': { color: '#2db84a', short: '林', img: '', bg: '#2db84a', fg: '', logo: '林里', fgColor: '#111111' },
  '麒麟大口茶': { color: '#1a4f9c', short: '麒', img: '', bg: '#ffd93b', fg: '', logo: '大口茶', fgColor: '#1a4f9c' },
  '百分茶': { color: '#2456b8', short: '百', img: '', bg: '#ffffff', fg: '🐱', logo: '', fgColor: '#2456b8' },
  '瑞幸咖啡': { color: '#1b2c54', short: '瑞', img: '', bg: '#1b2c54', fg: '', logo: '瑞幸', fgColor: '#ffffff' },
  '星巴克': { color: '#006241', short: '星', img: '', bg: '#006241', fg: '', logo: '星巴克', fgColor: '#ffffff' },
  '库迪咖啡': { color: '#c8102e', short: '库', img: '', bg: '#c8102e', fg: '', logo: '库迪', fgColor: '#ffffff' },
  'Manner': { color: '#1a1a1a', short: 'M', img: '', bg: '#ffffff', fg: '', logo: 'MANNER', fgColor: '#1a1a1a' },
  '挪瓦咖啡': { color: '#f28c28', short: '挪', img: '', bg: '#f28c28', fg: '', logo: '挪瓦', fgColor: '#ffffff' },
  '幸运咖': { color: '#c8102e', short: '幸', img: '', bg: '#ffd21f', fg: '', logo: '幸运咖', fgColor: '#c8102e' },
  '7分甜': { color: '#f7b500', short: '7', img: '', bg: '#f7b500', fg: '', logo: '7分甜', fgColor: '#ffffff' }
};

/* 糖度系数：无糖 / 3分糖 / 7分糖 / 标准糖 */
const DRINK_SUGAR = {
  '无糖': 0.35,
  '三分糖': 0.60,
  '七分糖': 0.85,
  '标准糖': 1.00
};

/* 冰量系数：标准冰 / 少冰 / 热 */
const DRINK_ICE = {
  '标准冰': 1.00,
  '少冰': 1.06,
  '热': 1.00
};

/* 饮品热量计算 */
function drinkCalories(brand, item, ice = '标准冰', sugar = '标准糖') {
  const rec = (DRINK_DB[brand] || {})[item];
  if (!rec) return 0;
  const sf = DRINK_SUGAR[sugar] ?? 1;
  const iceF = DRINK_ICE[ice] ?? 1;
  const kcal = ((rec.base - rec.sugar) + rec.sugar * sf) * iceF;
  return Math.round(kcal);
}

/* ---------- 运动 MET 值 ---------- */
const EXERCISE_MET = {
  '慢走': 3.0, '快走': 4.3, '慢跑': 7.0, '跑步': 9.8, '骑行': 7.5,
  '游泳': 8.0, '跳绳': 12.3, '瑜伽': 3.0, '力量训练': 6.0, '篮球': 6.5,
  '羽毛球': 5.5, '跳舞': 5.0, '爬山': 7.0, '椭圆机': 5.0, 'HIIT': 8.0,
  '普拉提': 3.8, '划船机': 7.0, '爬楼梯': 8.8, '太极': 3.0, '拳击': 8.0
};

/* ---------- 记账分类 ---------- */
const LEDGER_CATEGORIES = {
  expense: ['餐饮', '交通', '购物', '娱乐', '学习', '住房', '医疗', '其他'],
  income: ['工资', '兼职', '红包', '理财', '其他']
};

/* ---------- 观影类型 ---------- */
const WATCH_TYPES = ['电影', '电视剧', '综艺', '纪录片', '动漫', '番剧'];
