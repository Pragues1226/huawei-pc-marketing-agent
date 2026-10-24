"""Ephemeral stage counters, containing no prompts, documents or generated text."""
import secrets
import threading
import time

from agent.model import ModelError

PHASES = ('sources', 'extract', 'write', 'review')


class ProgressStore:
    def __init__(self, capacity=64, ttl=1800, clock=time.monotonic):
        self.capacity, self.ttl, self.clock = capacity, ttl, clock
        self.records = {}
        self.lock = threading.RLock()

    def _prune(self):
        now = self.clock()
        self.records = {ref: value for ref, value in self.records.items() if now - value['created'] < self.ttl}

    def _get(self, ref):
        self._prune()
        if not isinstance(ref, str) or ref not in self.records:
            raise ModelError('该次进度记录不存在或已过期，请查看本次生成请求的返回结果。')
        return self.records[ref]

    def create(self):
        with self.lock:
            self._prune()
            if len(self.records) >= self.capacity:
                finished = next((ref for ref, record in self.records.items() if record['status'] != 'running'), None)
                if finished:
                    del self.records[finished]
                else:
                    raise ModelError('当前任务较多，请稍后再开始新的创作。')
            ref = secrets.token_urlsafe(24)
            self.records[ref] = {'created': self.clock(), 'phase': 'sources', 'completed': 0, 'status': 'running', 'claimed': False}
            return {'progress_ref': ref}

    def snapshot(self, ref):
        with self.lock:
            record = self._get(ref)
            return {key: record[key] for key in ('phase', 'completed', 'status')} | {'total': len(PHASES)}

    def begin(self, ref):
        with self.lock:
            record = self._get(ref)
            if record['claimed'] or record['status'] != 'running':
                raise ModelError('该次进度已绑定其他请求，请勿重复提交。')
            record['claimed'] = True
        def update(phase):
            with self.lock:
                record = self.records.get(ref)
                if record and record['status'] == 'running' and phase in PHASES:
                    record['completed'] = max(record['completed'], PHASES.index(phase))
                    record['phase'] = PHASES[record['completed']]
        return update

    def finish(self, ref, status):
        with self.lock:
            record = self.records.get(ref)
            if record and record['status'] == 'running':
                record['status'] = status if status in {'ready','blocked','needs_input'} else 'error'
                if status == 'ready':
                    record['completed'] = len(PHASES)
