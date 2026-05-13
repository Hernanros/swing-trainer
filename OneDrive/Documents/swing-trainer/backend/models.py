import json
from datetime import datetime, timezone
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey
)
from sqlalchemy.orm import relationship
from backend.database import Base


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    trading_stage = Column(String, nullable=False)   # learning | small_money | active
    time_budget = Column(String, nullable=False)     # 15min | 30min | 60min
    active_skills = Column(Text, nullable=False)     # JSON list
    email = Column(String, nullable=True, unique=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    trades = relationship("Trade", back_populates="user", cascade="all, delete-orphan")
    playbook_rules = relationship("PlaybookRule", back_populates="user", cascade="all, delete-orphan")
    watchlist = relationship("WatchlistItem", back_populates="user", cascade="all, delete-orphan")
    skill_scores = relationship("SkillScore", back_populates="user", cascade="all, delete-orphan")
    drill_results = relationship("DrillResult", back_populates="user", cascade="all, delete-orphan")
    module_progress = relationship("ModuleProgress", back_populates="user", cascade="all, delete-orphan")
    ai_patterns = relationship("AIPattern", back_populates="user", cascade="all, delete-orphan")

    @property
    def active_skills_list(self):
        return json.loads(self.active_skills)


class Trade(Base):
    __tablename__ = "trades"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    symbol = Column(String, nullable=False)
    date = Column(String, nullable=False)
    direction = Column(String, nullable=False)       # long | short
    setup_type = Column(String, nullable=True)
    entry = Column(Float, nullable=False)
    stop = Column(Float, nullable=False)
    target = Column(Float, nullable=False)
    exit = Column(Float, nullable=True)
    shares = Column(Integer, nullable=False)
    status = Column(String, default="open")          # open | closed
    practice = Column(Boolean, default=False)
    pre_note = Column(Text, nullable=True)
    debrief = Column(Text, nullable=True)
    checklist_score = Column(Float, nullable=True)
    pnl = Column(Float, nullable=True)
    r_multiple = Column(Float, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="trades")
    checklist_logs = relationship("ChecklistLog", back_populates="trade", cascade="all, delete-orphan")


class ChecklistLog(Base):
    __tablename__ = "checklist_logs"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    trade_id = Column(Integer, ForeignKey("trades.id"), nullable=False)
    rule_id = Column(Integer, ForeignKey("playbook_rules.id"), nullable=False)
    checked = Column(Boolean, default=False)
    tier = Column(String, nullable=False)            # must | should | context

    trade = relationship("Trade", back_populates="checklist_logs")


class PlaybookRule(Base):
    __tablename__ = "playbook_rules"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    setup_type = Column(String, nullable=False)
    text = Column(Text, nullable=False)
    tier = Column(String, nullable=False)            # must | should | context
    position = Column(Integer, default=0)
    active = Column(Boolean, default=True)

    user = relationship("User", back_populates="playbook_rules")


class WatchlistItem(Base):
    __tablename__ = "watchlist"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    symbol = Column(String, nullable=False)
    exchange = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    added_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="watchlist")


class SkillScore(Base):
    __tablename__ = "skill_scores"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    skill = Column(String, nullable=False)
    score = Column(Float, default=0.0)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="skill_scores")


class DrillResult(Base):
    __tablename__ = "drill_results"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    drill_type = Column(String, nullable=False)
    skill = Column(String, nullable=False)
    score = Column(Float, nullable=False)
    date = Column(String, nullable=False)
    detail_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="drill_results")


class ModuleProgress(Base):
    __tablename__ = "module_progress"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    module_slug = Column(String, nullable=False)
    status = Column(String, default="locked")        # locked | assigned | in_progress | completed
    quiz_score = Column(Float, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="module_progress")


class AIPattern(Base):
    __tablename__ = "ai_patterns"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    pattern_text = Column(Text, nullable=False)
    severity = Column(String, nullable=False)        # problem | watch | strength
    detected_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    trade_range = Column(String, nullable=True)

    user = relationship("User", back_populates="ai_patterns")


class CachedContent(Base):
    __tablename__ = "cached_content"
    id = Column(Integer, primary_key=True)
    key = Column(String, unique=True, nullable=False)  # e.g. module:breakout-entry:theory:level2
    content = Column(Text, nullable=False)
    generated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
