"""Read the explicitly configured local v7 library as writing guidance, not facts."""
from pathlib import Path
import re

PLATFORMS = {'xiaohongshu': '小红书图文模板.md', 'wechat_article': '微信公众号图文模板.md', 'wechat_moments': '销售朋友圈模板.md'}

class LocalGuidance:
    def __init__(self, root=None):
        self.root = Path(root).resolve() if root else None

    def describe(self):
        ready = bool(self.root and self.root.is_dir())
        return {'status': 'ready' if ready else 'not_configured', 'label': self.root.name if ready else '本地创作指导未配置', 'note': '按平台、场景与型号读取 v7 指导；案例不作为产品事实。'}

    def select(self, task):
        status = self.describe()
        if status['status'] != 'ready':
            return {**status, 'documents': []}
        files = [self.root/'00-建库规范/06-智能体规则/检索顺序.md', self.root/'00-建库规范/06-智能体规则/引用格式.md', self.root/'P6-营销素材库/02-平台模板'/PLATFORMS[task['platform']]]
        key = re.sub(r'[\s（）()]', '', task['product'].lower()).replace('huawei', '').replace('鸿蒙版', '')
        student = any(w in task['audience']+task['scenario'] for w in ['学生','大学','新生','开学'])
        role = '学生' if student else '商务' if any(w in task['audience']+task['scenario'] for w in ['办公','会议','差旅']) else '门店'
        # Read one matching role/model expression and one matching customer scene.
        for section, words in [('P2-卖点话术库', [key]), ('P8-客户场景库', ['校园', '学生', '大学'] if any(w in task['audience']+task['scenario'] for w in ['学生','大学','新生','开学']) else ['办公','会议','商务'])]:
            candidates = []
            for p in (self.root/section).rglob('*.md'):
                label = re.sub(r'\s', '', p.relative_to(self.root).as_posix().lower())
                score = sum(len(w) for w in words if w and w in label)
                if section.startswith('P2') and score and role in p.name:
                    score += 100
                if score and '完整案例' not in label:
                    candidates.append((score, len(label), p))
            if candidates:
                files.append(sorted(candidates, key=lambda x: (-x[0], x[1], str(x[2])))[0][2])
        docs, budget = [], 16000
        for path in files:
            path = path.resolve()
            if not path.is_relative_to(self.root) or not path.is_file() or path.stat().st_size > 100000:
                continue
            text = path.read_text(encoding='utf-8-sig')
            if len(text) > budget:
                continue
            budget -= len(text)
            docs.append({'title': path.relative_to(self.root).as_posix(), 'text': text, 'role': 'writing_guidance_only'})
        return {**status, 'documents': docs}

def public_guidance(value):
    return {**{k:v for k,v in value.items() if k != 'documents'}, 'documents': [{'title': d['title'], 'role': d['role']} for d in value['documents']]}
