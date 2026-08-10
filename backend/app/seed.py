from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select

from app.database import SessionLocal
from app.models import Follow, Like, Post, Reply, Repost, User, UserRole
from app.security import hash_password

POSTS_PER_USER = 10
DEMO_PASSWORD = "Password123!"

DEMO_USERS = [
    ("admin.demo@kma.edu.vn", "admin", "KMA Admin", UserRole.ADMIN, "Quản trị cộng đồng KMA Threads."),
    ("an.nguyen.demo@kma.edu.vn", "an.nguyen", "An Nguyễn", UserRole.USER, "Backend engineer · Hà Nội"),
    (
        "linh.tran.demo@kma.edu.vn",
        "linh.tran",
        "Linh Trần",
        UserRole.USER,
        "Thiết kế những trải nghiệm số thật yên tĩnh.",
    ),
    (
        "minh.le.demo@kma.edu.vn",
        "minh.le",
        "Minh Lê",
        UserRole.USER,
        "Cà phê, code và những chuyến đi bộ trong phố.",
    ),
    (
        "thu.pham.demo@kma.edu.vn",
        "thu.pham",
        "Thu Phạm",
        UserRole.USER,
        "Sinh viên an toàn thông tin · mê nhiếp ảnh.",
    ),
    ("quang.do.demo@kma.edu.vn", "quang.do", "Quang Đỗ", UserRole.USER, "DevOps ban ngày, game thủ ban đêm."),
    (
        "mai.hoang.demo@kma.edu.vn",
        "mai.hoang",
        "Mai Hoàng",
        UserRole.USER,
        "Đọc sách, viết lách và học điều mới mỗi ngày.",
    ),
    ("nam.vo.demo@kma.edu.vn", "nam.vo", "Nam Võ", UserRole.USER, "Mobile developer · chạy bộ cuối tuần."),
    ("vy.bui.demo@kma.edu.vn", "vy.bui", "Vy Bùi", UserRole.USER, "UI designer, yêu typography và màu sắc."),
    (
        "khoa.nguyen.demo@kma.edu.vn",
        "khoa.nguyen",
        "Khoa Nguyễn",
        UserRole.USER,
        "Cybersecurity learner · CTF enthusiast.",
    ),
]

POST_TEMPLATES = [
    "Chào mọi người, mình là {name}. Rất vui được tham gia KMA Threads! 👋",
    "Một ngày học tập hiệu quả bắt đầu từ một danh sách việc cần làm thật ngắn.",
    "Vừa hoàn thành một tính năng mới. Cảm giác nhìn mọi thứ chạy ổn thật tuyệt ✨",
    "Góc làm việc hôm nay: cà phê, tai nghe và một chút nhạc không lời.",
    "Điều thú vị mình học được hôm nay: giải pháp đơn giản thường là giải pháp bền vững nhất.",
    "Có ai đang học thêm một công nghệ mới không? Chia sẻ tài liệu hay nhé!",
    "Cuối tuần là lúc đọc lại ghi chú và sắp xếp ý tưởng cho tuần mới.",
    "Một sản phẩm tốt không chỉ chạy đúng mà còn phải khiến người dùng cảm thấy dễ chịu.",
    "Đừng ngại đặt câu hỏi. Một câu hỏi đúng có thể tiết kiệm hàng giờ tìm sai hướng.",
    "Chúc mọi người một ngày nhiều năng lượng và thêm một bước gần mục tiêu! 🚀",
]

REPLY_TEMPLATES = [
    "Mình cũng nghĩ vậy, cảm ơn bạn đã chia sẻ!",
    "Ý tưởng hay đó. Mình sẽ thử áp dụng vào dự án hiện tại.",
]


def run():
    with SessionLocal() as db:
        password_hash = hash_password(DEMO_PASSWORD)
        users: list[User] = []
        created_users = 0
        created_posts = 0

        for email, username, name, role, bio in DEMO_USERS:
            user = db.scalar(select(User).where(User.username == username))
            if not user:
                user = User(
                    email=email,
                    username=username,
                    display_name=name,
                    role=role,
                    bio=bio,
                    password_hash=password_hash,
                    is_verified=role == UserRole.ADMIN,
                )
                db.add(user)
                db.flush()
                created_users += 1
            elif user.email.endswith("@threads.local"):
                # Sửa dữ liệu seed cũ: EmailStr từ chối TLD `.local` khi trả response đăng nhập.
                user.email = email
            users.append(user)

        now = datetime.now(UTC)
        for user_index, user in enumerate(users):
            current_count = db.scalar(
                select(func.count()).select_from(Post).where(Post.author_id == user.id)
            ) or 0
            missing = max(0, POSTS_PER_USER - current_count)
            for offset in range(missing):
                template_index = (current_count + offset) % len(POST_TEMPLATES)
                db.add(
                    Post(
                        author_id=user.id,
                        content=POST_TEMPLATES[template_index].format(name=user.display_name),
                        created_at=now - timedelta(hours=user_index * POSTS_PER_USER + template_index),
                    )
                )
                created_posts += 1
        db.flush()

        posts_by_user = {
            user.id: db.scalars(
                select(Post)
                .where(Post.author_id == user.id, ~Post.is_blocked)
                .order_by(Post.created_at.desc())
                .limit(POSTS_PER_USER)
            ).all()
            for user in users
        }

        for index, user in enumerate(users):
            # Mỗi tài khoản theo dõi ba tài khoản kế tiếp để trang chủ có nội dung phong phú.
            for step in range(1, 4):
                target = users[(index + step) % len(users)]
                key = {"follower_id": user.id, "following_id": target.id}
                if not db.get(Follow, key):
                    db.add(Follow(**key))

            # Hai lượt tương tác/tài khoản giúp tab Trả lời và Đăng lại luôn có dữ liệu mẫu.
            for step, reply_content in enumerate(REPLY_TEMPLATES, start=1):
                target = users[(index + step) % len(users)]
                target_post = posts_by_user[target.id][step - 1]
                repost_key = {"user_id": user.id, "post_id": target_post.id}
                if not db.get(Repost, repost_key):
                    db.add(Repost(**repost_key))
                if not db.get(Like, repost_key):
                    db.add(Like(**repost_key))
                reply_exists = db.scalar(
                    select(Reply).where(
                        Reply.author_id == user.id,
                        Reply.post_id == target_post.id,
                        Reply.content == reply_content,
                    )
                )
                if not reply_exists:
                    db.add(
                        Reply(
                            author_id=user.id,
                            post_id=target_post.id,
                            content=reply_content,
                        )
                    )

        db.commit()
        print(
            f"Seed complete: {created_users} users and {created_posts} posts added. "
            f"Demo login: an.nguyen / {DEMO_PASSWORD}"
        )


if __name__ == "__main__":
    run()
